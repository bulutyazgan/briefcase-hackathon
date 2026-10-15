import { generateText, Output, type LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createFireworks } from '@ai-sdk/fireworks'
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
import { vatBreakdownText } from '../books/books'
import { syncBooks } from '../books/sync'
import { reply } from '../channels/channel'
import { sendTelegramPdf } from '../channels/telegram'
import { canonicalClientName, recallFacts, recallSeededFacts, rememberFact } from '../memory/memory'
import { leadsCsv, type Lead } from '../leads/leads'
import { defaultSourcer } from '../leads/default-sourcer'
import { withFallback } from '../leads/fallback-sourcer'
import { tregSourcer } from '../leads/providers/treg/treg-sourcer'
import type { Sourcer } from '../leads/sourcing'
import { findClient } from '../clients/clients'
import { AUTO_SEND_LIMIT_PENCE, decide, type BillableIntent, type Decision, type MemoryFact } from '../policy/decide'
import { discountTermsSchema, extractDiscountTerms, type DiscountTerms } from '../pricing/discount'
import { settleOrder } from '../pricing/order'
import { sourcingCapMicro } from '../pricing/pricing'
import { renderInvoicePdf } from '../invoice-pdf/render'
import { blockIfPaused, handleControlCommand } from '../control/control'
import { runCollectionsTick } from '../collections/collections'
import { meterQualifiedLeads, recordLeadQualification } from '../meters/meters'
import { handleCreditNoteApproval, handleDispute } from '../credit-notes/credit-notes'
import { offerUpsellToAgentBuyer } from '../buyer/upsell'
import { handleOfferAcceptance, handleOfferApproval, runOpportunityTick } from '../opportunities/opportunities'
import { gateFirstInvoice, handleIntake, identifyClient, onboardClient } from '../intake/intake'
import { converse, wantsPlanChange } from '../concierge/concierge'
import { money as staffMoney, noteToStaff } from '../staff/staff'

const intentSchema = z.object({
  isCommitment: z.boolean(),
  clientName: z.string(),
  ask: z.string(),
  icp: z.string(),
  signals: z.array(z.string()),
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
  discountTerms: discountTermsSchema.nullable().default(null),
  // 'priced': decided before sourcing. 'sourced': leads bought, decision re-priced.
  stage: z.enum(['priced', 'sourced']).default('priced'),
  costMicro: z.number().default(0),
})

type SavedDecision = {
  intent: BillableIntent
  facts: MemoryFact[]
  leads: Lead[]
  decision: Decision
  discountTerms: DiscountTerms | null
  stage: 'priced' | 'sourced'
  costMicro: number
}

// The one place the loop's lead source is chosen: Treg first, then Firecrawl or the seed list.
const sourcer: Sourcer = withFallback(tregSourcer, defaultSourcer)

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

const SIGNAL_PATTERNS: Array<[RegExp, string]> = [
  [/\b(just\s+)?raised|funding|series\s+[a-e]\b/i, 'recently raised funding'],
  [/\bhiring\b/i, 'hiring'],
  [/\bnew\s+(cfo|ceo|cto|hire)s?\b/i, 'new executive hire'],
  [/\bexpand(ing|ed)?\b/i, 'expanding'],
  [/\bacquir(ed|ing|ition)\b/i, 'acquisition activity'],
]

export function heuristicSignals(text: string): string[] {
  return SIGNAL_PATTERNS.flatMap(([pattern, signal]) => pattern.test(text) ? [signal] : [])
}

function heuristicIntent(message: ChannelMessage): BillableIntent {
  const quantityMatch = message.text.match(/\b(\d{1,5})\s+(?:fintech\s+)?(?:CFO\s+)?leads?\b/i)
  const quantity = quantityMatch?.[1] ? Number(quantityMatch[1]) : null
  const client = findClient(message.author)
  // Any sender can commit; whether they are a known client is P5's call in decide(), not extraction's.
  return {
    isCommitment: message.author !== 'tally'
      && /\b(let'?s|go ahead|order|kick off|please proceed)\b/i.test(message.text)
      && quantity !== null,
    clientName: client?.name ?? (message.channel.startsWith('slack:') ? 'Northwind Capital' : message.author),
    ask: message.text,
    icp: /fintech/i.test(message.text) ? 'fintech CFOs in London' : message.text,
    signals: heuristicSignals(message.text),
    quantity,
    quote: message.text,
  }
}

async function extractIntent(message: ChannelMessage): Promise<{ intent: BillableIntent; model: string }> {
  const prompt = [
    'Extract a billable client commitment from this message.',
    'The quote must be an exact substring. Do not invent any details.',
    'signals are buying signals the client asked for (e.g. "just raised", "hiring"); empty if none.',
    `Message author: ${message.author}`,
    `Message: ${message.text}`,
  ].join('\n')
  // OpenAI first (Louis's call), Fireworks second, deterministic heuristics when no key is configured.
  const openaiKey = process.env.OPENAI_API_KEY
  const fireworksKey = process.env.FIREWORKS_API_KEY
  const candidates: Array<{ id: string; model: LanguageModel }> = []
  if (openaiKey) {
    const modelId = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'
    candidates.push({ id: modelId, model: createOpenAI({ apiKey: openaiKey })(modelId) })
  }
  if (fireworksKey) {
    const fireworks = createFireworks({ apiKey: fireworksKey })
    for (const modelId of ['accounts/fireworks/models/deepseek-v4p1-flash', 'accounts/fireworks/models/glm-5p3-flash']) {
      candidates.push({ id: modelId, model: fireworks(modelId) })
    }
  }
  for (const candidate of candidates) {
    try {
      const { output } = await generateText({ model: candidate.model, output: Output.object({ schema: intentSchema }), prompt })
      return { intent: output, model: candidate.id }
    } catch (error) {
      console.warn(`Extraction failed for ${candidate.id}: ${String(error)}`)
    }
  }
  return { intent: heuristicIntent(message), model: candidates.length ? 'local-fallback-after-model-error' : 'local-fallback' }
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
    `This invoice is ${vatBreakdownText(invoice.total_pence)} because the client agreed to the work.`,
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
  if (await blockIfPaused(message)) return
  try {
    const result = await createInvoice(message.id, intent, decision)
    recordStep(message.id, 'bill', 'Created and finalised a Stripe invoice.', {
      stripeInvoiceId: result.stripeInvoiceId,
      hostedUrl: result.hostedUrl,
      totalPence: decision.totalPence,
      idempotencyKey: message.id,
    }, decision.clauses)
    void noteToStaff(message.id, 'invoice', `Invoiced ${intent.clientName} ${staffMoney(decision.totalPence)} for ${leads.length} leads (invoice ${result.stripeInvoiceId}), sent to ${findClient(intent.clientName)?.billingEmail ?? 'the client'}. No action needed.`, decision.clauses)
    // Metering is audit, not the money path: never hold the invoice reply on hundreds of meter calls.
    void meterQualifiedLeads(message.id)
    syncBooks()

    let pdfPath: string | null = null
    try {
      const client = findClient(intent.clientName)
      pdfPath = await renderInvoicePdf({
        invoiceId: message.id,
        issuedAt: new Date(),
        dueInDays: 7,
        client: { name: client?.name ?? intent.clientName, email: client?.billingEmail ?? '' },
        totalPence: decision.totalPence,
        lines: decision.lines,
        paymentUrl: result.hostedUrl ?? undefined,
        stripeInvoiceId: result.stripeInvoiceId ?? undefined,
      })
      updateInvoice(message.id, 'open', undefined, pdfPath)
      recordStep(message.id, 'render', 'Rendered the invoice and evidence appendix.', { pdfPath }, decision.clauses)
    } catch (error) {
      recordStep(message.id, 'render', 'PDF rendering failed.', { error: String(error) }, decision.clauses)
    }

    try {
      await rememberFact(intent.clientName, `${new Date().toISOString().slice(0, 10)}: invoiced ${intent.ask}`)
      recordStep(message.id, 'remember', 'Saved the client commitment to client memory.', {
        clientName: intent.clientName,
      })
    } catch (error) {
      recordStep(message.id, 'remember', 'Client memory write failed.', { error: String(error) })
    }

    const pdfUrl = pdfPath ? `/api/invoices/${message.id}/pdf` : 'PDF unavailable'
    const leadUrl = `/api/leads/${message.id}.csv`
    const availableNote = leads.length < (intent.quantity ?? leads.length)
      ? `We found ${leads.length} of the ${intent.quantity} leads requested. The invoice covers only the ${leads.length} delivered.`
      : `${leads.length} leads are ready.`
    await reply(message, [
      `Invoice created for ${vatBreakdownText(decision.totalPence)}.`,
      result.hostedUrl,
      `Invoice PDF: ${pdfUrl}`,
      `Lead list: ${leadUrl}`,
      availableNote,
    ].join('\n'))
    if (pdfPath) await sendTelegramPdf(message, pdfPath, `Invoice ${result.stripeInvoiceId ?? ''} for £${(decision.totalPence / 100).toFixed(2)}`.replace('  ', ' ')).catch((error: unknown) => console.error(`Telegram PDF failed: ${String(error)}`))
    recordStep(message.id, 'deliver', 'Posted invoice, PDF and lead-list links to the source thread.', {
      hostedUrl: result.hostedUrl,
      pdfUrl,
      leadUrl,
    }, decision.clauses)
    await offerUpsellToAgentBuyer(message, intent.clientName)
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

async function requestApproval(
  message: ChannelMessage,
  amount: string,
  reason: string,
  clauses: string[],
): Promise<void> {
  saveApproval({ id: message.id, message_id: message.id, status: 'pending', reason })
  recordStep(message.id, 'approval', 'Requested account-owner approval.', { amount, reason, clauses }, clauses)
  void noteToStaff(message.id, 'approval', `Approval needed from the account owner: ${amount} invoice for ${findClient(message.author)?.name ?? message.author}. ${reason}`, clauses)
  await reply(message, `Approval required for ${amount}. ${reason} Approve here or in Tally.`, [], { approvalFor: message.id })
}

// Decide, then buy, then bill: only runs once the order is auto-approved or approved (P4).
async function sourceAndBill(message: ChannelMessage, priced: SavedDecision): Promise<void> {
  const { intent, facts, discountTerms } = priced
  const requestedQuantity = intent.quantity ?? 0
  const maxTotalCostMicro = sourcingCapMicro(priced.decision.totalPence)
  const sourcing = await sourcer({
    orderId: message.id,
    icp: intent.icp,
    signals: intent.signals,
    quantity: requestedQuantity,
    maxTotalCostMicro,
  })
  // Internal audit only: provider names never reach the client.
  recordStep(message.id, 'source', `Bought ${sourcing.leads.length} leads for ${sourcing.costMicro} micro-USD.`, {
    source: sourcing.source,
    calls: sourcing.calls,
    costMicro: sourcing.costMicro,
    maxTotalCostMicro,
  }, ['P9', 'P10'])

  const settled = settleOrder(intent, facts, discountTerms, requestedQuantity, sourcing)
  const leads: Lead[] = settled.leads.map(({ name, company, url }) => ({ name, company, url }))
  recordLeadQualification(message.id, settled.leads)
  recordStep(message.id, 'size', `Sourced ${leads.length} of ${requestedQuantity} leads.`, {
    requested: requestedQuantity,
    found: leads.length,
    leads,
    csv: leadsCsv(leads),
  })
  const saved: SavedDecision = {
    intent,
    facts,
    leads,
    decision: settled.decision,
    discountTerms,
    stage: 'sourced',
    costMicro: settled.costMicro,
  }
  recordStep(message.id, 'margin', settled.decision.reason, settled.margin, ['P8'])
  recordStep(message.id, 'decide', settled.decision.reason, saved, settled.decision.clauses)

  if (settled.decision.outcome === 'refuse') {
    await reply(message, `I could not source any leads for this order, so no invoice was created. ${settled.decision.reason}`)
    return
  }
  if (settled.decision.outcome === 'needs_approval') {
    const amount = `£${(settled.decision.totalPence / 100).toFixed(2)}`
    await requestApproval(message, amount, `${amount}: ${settled.decision.reason}`, ['P8'])
    return
  }
  await continueBilling(message, saved)
}

async function processMessage(message: ChannelMessage): Promise<void> {
  if (await handleControlCommand(message)) return
  try {
    if (/\bwhy\b/i.test(message.text) && await explainLatestInvoice(message)) return
    if (await handleDispute(message)) return
    if (await handleOfferAcceptance(message, billCommitment)) return
    // P12: an unknown sender's question is answered from the company knowledge base before P5 can refuse it.
    if (await handleIntake(message)) return
    if (wantsPlanChange(message.text)) {
      await converse(message)
      markMessageProcessed(message.id)
      return
    }
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
    // P5: the sender identifies the client; the extracted name is only a fallback.
    const knownClient = identifyClient(message, await canonicalClientName(intent.clientName))
    intent.clientName = knownClient?.name ?? intent.clientName
    const quoteValid = intent.quote.length > 0 && message.text.includes(intent.quote)
    if (!quoteValid) intent.isCommitment = false
    // P12: a sender who inquired earlier in this thread and now commits is onboarded, then billed as usual.
    if (intent.isCommitment && !knownClient) {
      const onboarded = await onboardClient(message, intent)
      if (onboarded) intent.clientName = onboarded.name
    }
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
      await converse(message)
      markMessageProcessed(message.id)
      return
    }
    await billCommitment(message, intent)
    markMessageProcessed(message.id)
  } catch (error) {
    recordStep(message.id, 'error', 'The agent could not complete this message.', { error: String(error) })
    await reply(message, `Tally could not complete this request: ${String(error)}`)
    markMessageProcessed(message.id)
  }
}

// The commitment path: recall, price, decide, then source and bill. Shared by extracted commitments and accepted offers.
async function billCommitment(message: ChannelMessage, intent: BillableIntent): Promise<void> {
    let facts: MemoryFact[] = []
    try {
      facts = await recallFacts(intent.clientName, intent.ask)
    } catch (error) {
      recordStep(message.id, 'recall', 'Live memory recall failed; using the seeded memory facts.', { error: String(error) })
      facts = await recallSeededFacts(intent.clientName)
    }
    recordStep(message.id, 'recall', `Recalled ${facts.length} client memory facts.`, { facts })

    const discount = await extractDiscountTerms(facts)
    recordStep(message.id, 'discount', discount.terms
      ? `Extracted a remembered discount: ${discount.terms.percent}% over ${discount.terms.threshold} leads.`
      : 'No remembered discount was extracted.', { terms: discount.terms, model: discount.model }, ['P3'])

    const requestedQuantity = intent.quantity ?? 0
    const client = findClient(intent.clientName)
    const decision = gateFirstInvoice(client, decide(intent, facts, requestedQuantity, discount.terms))
    recordStep(message.id, 'price', client
      ? `Priced ${requestedQuantity} leads at £${(client.pricePerLeadPence / 100).toFixed(2)} per lead.`
      : 'Could not price: unknown client.', {
      ratePence: client?.pricePerLeadPence ?? null,
      requestedQuantity,
      discount: decision.lines[0]?.memoryFact ?? 'No eligible discount',
      totalPence: decision.totalPence,
    }, decision.clauses.filter((clause) => clause === 'P2' || clause === 'P3' || clause === 'P5'))
    const saved: SavedDecision = {
      intent,
      facts,
      leads: [],
      decision,
      discountTerms: discount.terms,
      stage: 'priced',
      costMicro: 0,
    }
    recordStep(message.id, 'decide', decision.reason, saved, decision.clauses)

    if (decision.outcome === 'refuse') {
      await reply(message, `I will not create an invoice. ${decision.reason} Policy: ${decision.clauses.join(', ')}.`)
      return
    }
    if (decision.outcome === 'needs_approval') {
      const amount = `£${(decision.totalPence / 100).toFixed(2)}`
      const firstInvoice = decision.clauses.includes('P12')
      const reason = firstInvoice ? decision.reason : `${amount} exceeds the £1,000 auto-send limit.`
      const overLimit = decision.totalPence > AUTO_SEND_LIMIT_PENCE
      await requestApproval(message, amount, reason, firstInvoice ? (overLimit ? ['P4', 'P12'] : ['P12']) : ['P4'])
      return
    }
    await sourceAndBill(message, saved)
}

async function processApprovedMessage(messageId: string): Promise<void> {
  const message = getMessage(messageId)
  const saved = findSavedDecision(messageId)
  if (!message || !saved) {
    if (message) await reply(message, 'I could not load the saved decision. Please send the request again.')
    return
  }
  if (saved.stage === 'sourced') await continueBilling(message, saved)
  else await sourceAndBill(message, saved)
}

export async function handleApproval(messageId: string, action: 'approve' | 'reject'): Promise<void> {
  if (await handleCreditNoteApproval(messageId, action)) return
  if (await handleOfferApproval(messageId, action)) return
  const message = getMessage(messageId)
  if (!message) return
  updateApproval(messageId, action === 'approve' ? 'approved' : 'rejected')
  const savedForClause = findSavedDecision(messageId)
  const clause = savedForClause?.stage === 'sourced' ? 'P8' : savedForClause?.decision.clauses.includes('P12') ? 'P12' : 'P4'
  recordStep(messageId, 'approval', action === 'approve' ? 'Account owner approved billing.' : 'Account owner rejected billing.', {
    action,
    policyClause: clause,
  }, [clause])
  if (action === 'approve') {
    await reply(message, 'Approved. Tally is preparing the invoice.')
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
  setInterval(() => { void runCollectionsTick(new Date()).catch((error) => console.warn(`Collections tick failed: ${String(error)}`)) }, 60000)
  setInterval(() => { void runOpportunityTick(new Date()).catch((error) => console.warn(`Opportunity tick failed: ${String(error)}`)) }, 20000)
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
      void noteToStaff(invoice.message_id, 'payment', `Payment received: ${message ? findClient(message.author)?.name ?? message.author : 'client'} paid ${staffMoney(invoice.total_pence)} on invoice ${invoice.stripe_invoice_id}; the lead list was delivered. No action needed.`, ['P2', 'P6'])
      syncBooks()
    } catch (error) {
      if (error instanceof BillingBlockedError) return
      console.warn(`Invoice status poll failed for ${invoice.id}: ${String(error)}`)
    }
  }
}
