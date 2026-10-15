import { generateText, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import {
  getEvent,
  getLatestInvoiceForThread,
  getMessage,
  getOldestUnprocessedMessage,
  listOpenInvoices,
  markMessageProcessed,
  recordEvent,
  saveApproval,
  updateApproval,
  updateInvoice,
  type ChannelMessage,
} from '../ledger/store'
import { createInvoice, BillingBlockedError, readStripeInvoiceStatus } from '../billing/billing'
import { reply } from '../channels/channel'
import { findClient, recallFacts, recallSeededFacts, rememberFact } from '../memory/memory'
import { leadsCsv, seedLeads, sourceLeads, type Lead } from '../leads/leads'
import { decide, type BillableIntent, type Decision, type MemoryFact } from '../policy/decide'
import { renderInvoicePdf } from '../invoice-pdf/render'

const intentSchema = z.object({
  isCommitment: z.boolean(),
  clientName: z.string(),
  ask: z.string(),
  icp: z.string(),
  quantity: z.number().int().nullable(),
  quote: z.string(),
})

const memoryFactSchema = z.object({ fact: z.string(), date: z.string() })
const leadSchema = z.object({ name: z.string(), company: z.string(), url: z.string() })
const lineSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPricePence: z.number(),
  totalPence: z.number(),
  quote: z.string(),
  memoryFact: z.string(),
  clauses: z.array(z.string()),
})
const decisionSchema = z.object({
  outcome: z.enum(['auto', 'needs_approval', 'refuse']),
  clauses: z.array(z.string()),
  lines: z.array(lineSchema),
  totalPence: z.number(),
  reason: z.string(),
})
const savedDecisionSchema = z.object({
  intent: intentSchema,
  facts: z.array(memoryFactSchema),
  leads: z.array(leadSchema),
  decision: decisionSchema,
})

type SavedDecision = {
  intent: BillableIntent
  facts: MemoryFact[]
  leads: Lead[]
  decision: Decision
}

function recordStep(
  messageId: string,
  step: string,
  summary: string,
  data: unknown,
  clauses: string[] = [],
): void {
  recordEvent({
    id: crypto.randomUUID(),
    message_id: messageId,
    step,
    summary,
    data_json: JSON.stringify(data) ?? 'null',
    policy_clause: clauses.length ? clauses.join(',') : null,
  })
}

async function extractIntent(
  message: ChannelMessage,
): Promise<{ intent: BillableIntent; model: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const openai = createOpenAI({ apiKey })
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'
  const prompt = [
    'Extract a billable client commitment from this message.',
    'The quote must be an exact substring. Do not invent any details.',
    `Message author: ${message.author}`,
    `Message: ${message.text}`,
  ].join('\n')
  const { output } = await generateText({
    model: openai(model),
    output: Output.object({ schema: intentSchema }),
    prompt,
  })
  return { intent: output, model }
}

function findSavedDecision(messageId: string): SavedDecision | null {
  const event = getEvent(messageId, 'decide')
  if (!event) return null
  const parsed = savedDecisionSchema.safeParse(JSON.parse(event.data_json))
  return parsed.success ? parsed.data : null
}

async function explainLatestInvoice(message: ChannelMessage): Promise<boolean> {
  const invoice = getLatestInvoiceForThread(message.thread)
  if (!invoice) return false
  const saved = findSavedDecision(invoice.message_id)
  const explanation = saved?.decision.lines.map((line) =>
    `Quote: “${line.quote}”\nMemory: ${line.memoryFact}\nPolicy: ${line.clauses.join(', ')}`,
  ).join('\n') ?? 'The evidence details are not available.'
  const text = [
    `This invoice is £${(invoice.total_pence / 100).toFixed(2)} because the client agreed to the work.`,
    explanation,
    `Policy clauses: ${saved?.decision.clauses.join(', ') ?? 'not recorded'}.`,
    `Stripe invoice: ${invoice.stripe_invoice_id ?? 'not created'}.`,
  ].join('\n')
  recordStep(message.id, 'explain', 'Explained the latest invoice from its audit evidence.', {
    invoiceId: invoice.id,
    stripeInvoiceId: invoice.stripe_invoice_id,
    quote: saved?.intent.quote ?? '',
    facts: saved?.facts ?? [],
    clauses: saved?.decision.clauses ?? [],
  })
  await reply(message, text)
  markMessageProcessed(message.id)
  return true
}

async function continueBilling(message: ChannelMessage, saved: SavedDecision): Promise<void> {
  const { intent, facts, leads, decision } = saved
  try {
    const result = await createInvoice(message.id, intent, decision)
    recordStep(message.id, 'bill', 'Created and finalised a Stripe invoice.', {
      stripeInvoiceId: result.stripeInvoiceId,
      hostedUrl: result.hostedUrl,
      totalPence: decision.totalPence,
      idempotencyKey: message.id,
    }, decision.clauses)

    let pdfPath: string | null = null
    try {
      pdfPath = await renderInvoicePdf({
        invoiceId: message.id,
        clientName: intent.clientName,
        totalPence: decision.totalPence,
        lines: decision.lines,
      })
      updateInvoice(message.id, 'open', undefined, pdfPath)
      recordStep(message.id, 'render', 'Rendered the invoice and evidence appendix.', { pdfPath }, decision.clauses)
    } catch (error) {
      recordStep(message.id, 'render', 'PDF rendering failed.', { error: String(error) }, decision.clauses)
    }

    try {
      await rememberFact(intent.clientName, `${new Date().toISOString().slice(0, 10)}: invoiced ${intent.ask}`)
      recordStep(message.id, 'remember', 'Saved the client commitment to Cognee memory.', {
        clientName: intent.clientName,
      })
    } catch (error) {
      recordStep(message.id, 'remember', 'Cognee memory write failed.', { error: String(error) })
    }

    const pdfUrl = pdfPath ? `/api/invoices/${message.id}/pdf` : 'PDF unavailable'
    const leadUrl = `/api/leads/${message.id}.csv`
    const availableNote = leads.length < (intent.quantity ?? leads.length)
      ? `The search returned ${leads.length} leads. The invoice uses the requested quantity; the delivered list contains the leads found.`
      : `${leads.length} leads were found.`
    await reply(message, [
      `Invoice created for £${(decision.totalPence / 100).toFixed(2)}.`,
      result.hostedUrl,
      `Invoice PDF: ${pdfUrl}`,
      `Lead list: ${leadUrl}`,
      availableNote,
    ].join('\n'))
    recordStep(message.id, 'deliver', 'Posted invoice, PDF and lead-list links to the source thread.', {
      hostedUrl: result.hostedUrl,
      pdfUrl,
      leadUrl,
    }, decision.clauses)
  } catch (error) {
    if (error instanceof BillingBlockedError) {
      recordStep(message.id, 'billing_blocked', error.message, {
        clientName: intent.clientName,
        totalPence: decision.totalPence,
      }, decision.clauses)
      await reply(message, `Billing blocked: ${error.message} The policy and evidence steps are complete.`)
      return
    }
    throw error
  }
}

async function processMessage(message: ChannelMessage): Promise<void> {
  try {
    if (/\bwhy\b/i.test(message.text) && await explainLatestInvoice(message)) return
    const extracted = await extractIntent(message)
    if (!extracted) {
      const reason = 'OPENAI_API_KEY is not configured; extraction is blocked.'
      recordStep(message.id, 'extract_blocked', reason, {
        model: process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini',
      }, ['P1'])
      await reply(message, `Extraction blocked: ${reason}`)
      markMessageProcessed(message.id)
      return
    }
    const intent = extracted.intent
    intent.clientName = findClient(intent.clientName)?.name ?? intent.clientName
    const quoteValid = intent.quote.length > 0 && message.text.includes(intent.quote)
    if (!quoteValid) intent.isCommitment = false
    recordStep(message.id, 'extract', quoteValid ? 'Extracted a commitment and validated its verbatim quote.' : 'No valid source quote was found.', {
      ...intent,
      quoteValid,
      model: extracted.model,
    }, ['P1'])

    if (!intent.isCommitment || !quoteValid) {
      recordStep(message.id, 'decide', 'Refused to bill without an explicit commitment and source quote.', {
        outcome: 'refuse',
        reason: 'P1 requires an explicit commitment with a verbatim quote.',
      }, ['P1'])
      await reply(message, 'I could not confirm a billable client commitment in that message.')
      markMessageProcessed(message.id)
      return
    }

    let facts: MemoryFact[] = []
    try {
      facts = await recallFacts(intent.clientName, intent.ask)
    } catch (error) {
      recordStep(message.id, 'recall', 'Cognee recall failed; using the seeded memory facts.', { error: String(error) })
      facts = await recallSeededFacts(intent.clientName)
    }
    recordStep(message.id, 'recall', `Recalled ${facts.length} client memory facts.`, { facts })

    let leads: Lead[] = []
    try {
      leads = await sourceLeads(intent.icp, intent.quantity ?? 1)
    } catch (error) {
      recordStep(message.id, 'size', 'Firecrawl search failed; using the seeded lead list.', { error: String(error) })
      leads = await seedLeads()
    }
    recordStep(message.id, 'size', `Sourced ${leads.length} leads.`, {
      requested: intent.quantity,
      found: leads.length,
      leads,
      csv: leadsCsv(leads),
    })

    const billedQuantity = intent.quantity ?? leads.length
    const decision = decide(intent, facts, billedQuantity, leads.length)
    recordStep(message.id, 'price', `Priced ${billedQuantity} leads at £4 per lead.`, {
      ratePence: 400,
      requestedQuantity: billedQuantity,
      foundQuantity: leads.length,
      discount: decision.lines[0]?.memoryFact ?? 'No eligible discount',
      totalPence: decision.totalPence,
    }, [
      'P2',
      ...(decision.lines.some((line) => !line.memoryFact.includes('No eligible discount')) ? ['P3'] : []),
    ])
    const saved = { intent, facts, leads, decision }
    recordStep(message.id, 'decide', decision.reason, {
      decision,
      intent,
      facts,
      leads,
    }, decision.clauses)

    if (decision.outcome === 'refuse') {
      await reply(message, `I will not create an invoice. ${decision.reason} Policy: ${decision.clauses.join(', ')}.`)
      markMessageProcessed(message.id)
      return
    }
    if (decision.outcome === 'needs_approval') {
      const amount = `£${(decision.totalPence / 100).toFixed(2)}`
      const reason = `${amount} exceeds the £1,000 auto-send limit.`
      saveApproval({
        id: message.id,
        message_id: message.id,
        status: 'pending',
        reason,
      })
      recordStep(message.id, 'approval', 'Requested account-owner approval.', {
        amount,
        reason,
        clauses: decision.clauses,
      }, ['P4'])
      await reply(message, `Approval required for ${amount}. ${reason} Review the approval card in Tally.`)
      markMessageProcessed(message.id)
      return
    }
    await continueBilling(message, saved)
    markMessageProcessed(message.id)
  } catch (error) {
    recordStep(message.id, 'error', 'The agent could not complete this message.', { error: String(error) })
    await reply(message, `Tally could not complete this request: ${String(error)}`)
    markMessageProcessed(message.id)
  }
}

async function processApprovedMessage(messageId: string): Promise<void> {
  const message = getMessage(messageId)
  const saved = findSavedDecision(messageId)
  if (!message || !saved) {
    if (message) await reply(message, 'I could not load the saved decision. Please send the request again.')
    return
  }
  await continueBilling(message, saved)
}

export async function handleApproval(messageId: string, action: 'approve' | 'reject'): Promise<void> {
  const message = getMessage(messageId)
  if (!message) return
  updateApproval(messageId, action === 'approve' ? 'approved' : 'rejected')
  recordStep(messageId, 'approval', action === 'approve' ? 'Account owner approved billing.' : 'Account owner rejected billing.', {
    action,
    policyClause: 'P4',
  }, ['P4'])
  if (action === 'approve') {
    await reply(message, 'Approved. Tally is creating the invoice.')
    await processApprovedMessage(messageId)
    markMessageProcessed(messageId)
    return
  }
  await reply(message, 'Invoice rejected. No Stripe charge was created.')
  markMessageProcessed(messageId)
}

let processing = false

export function startAgentLoop(): void {
  setInterval(() => {
    if (processing) return
    processing = true
    const message = getOldestUnprocessedMessage()
    const task = message ? processMessage(message) : Promise.resolve()
    void task.finally(() => { processing = false })
  }, 2000)

  setInterval(() => {
    void pollInvoices()
  }, 10000)
}

async function pollInvoices(): Promise<void> {
  for (const invoice of listOpenInvoices()) {
    if (!invoice.stripe_invoice_id) continue
    try {
      const status = await readStripeInvoiceStatus(invoice.stripe_invoice_id)
      if (status !== 'paid') continue
      updateInvoice(invoice.id, 'paid')
      const message = getMessage(invoice.message_id)
      const event = getEvent(invoice.message_id, 'size')
      const parsed = event ? JSON.parse(event.data_json) : null
      const savedLeads = parsed && typeof parsed === 'object' && 'leads' in parsed && Array.isArray(parsed.leads)
        ? z.array(leadSchema).safeParse(parsed.leads)
        : null
      const csv = savedLeads?.success ? leadsCsv(savedLeads.data) : 'name,company,url'
      if (message) {
        await reply(message, 'Payment received. Here is the lead list.', [{
          name: 'Download lead list',
          content: `/api/leads/${invoice.id}.csv\n${csv}`,
        }])
      }
      recordStep(invoice.message_id, 'paid', 'Stripe marked the invoice as paid; lead delivery was posted.', {
        stripeInvoiceId: invoice.stripe_invoice_id,
        csvRows: savedLeads?.success ? savedLeads.data.length : 0,
      }, ['P2', 'P6'])
    } catch (error) {
      if (error instanceof BillingBlockedError) return
      console.warn(`Invoice status poll failed for ${invoice.id}: ${String(error)}`)
    }
  }
}
