import { generateObject } from 'ai'
import { createFireworks } from '@ai-sdk/fireworks'
import { z } from 'zod'
import {
  getEvent,
  getLatestInvoiceForThread,
  getMessage,
  markMessageProcessed,
  recordEvent,
  saveApproval,
  updateApproval,
  type ChannelMessage,
  type InvoiceRow,
} from '../ledger/store'
import { BillingBlockedError, getStripe } from '../billing/billing'
import { reply } from '../channels/channel'
import { remember, type MemoryRole } from '../memory/memory'
import { findClient } from '../clients/clients'
import { blockIfPaused } from '../control/control'
import type { Lead } from '../leads/leads'
import { noteToStaff } from '../staff/staff'

// P11: credit notes up to £200 are issued automatically; above that the account owner approves.
export const AUTO_CREDIT_LIMIT_PENCE = 20000

const disputeClaimSchema = z.object({
  isDispute: z.boolean(),
  claimedValidCount: z.number().int().nullable(),
  claimedInvalidCount: z.number().int().nullable(),
  quote: z.string(),
})
export type DisputeClaim = z.infer<typeof disputeClaimSchema>

export type RowProblem = 'missing_name' | 'missing_company' | 'missing_url' | 'duplicate'
export interface RowCheck {
  row: number
  problems: RowProblem[]
}

const leadSchema = z.object({ name: z.string(), company: z.string(), url: z.string() })

const savedCreditSchema = z.object({
  outcome: z.enum(['auto', 'needs_approval', 'refuse']),
  reason: z.string(),
  invoiceId: z.string(),
  stripeInvoiceId: z.string().nullable(),
  clientName: z.string(),
  quote: z.string(),
  delivered: z.number(),
  claimedInvalid: z.number().nullable(),
  codeInvalid: z.number(),
  creditedLeads: z.number(),
  unitPricePence: z.number(),
  totalPence: z.number(),
})
export type CreditDecision = z.infer<typeof savedCreditSchema>

export interface CreditNoteRequest {
  stripeInvoiceId: string
  description: string
  quantity: number
  unitAmountPence: number
  memo: string
}

export interface CreditNoteIssuer {
  create(request: CreditNoteRequest, idempotencyKey: string): Promise<{ id: string; totalPence: number }>
}

export interface CreditNoteDeps {
  extract(message: ChannelMessage): Promise<{ claim: DisputeClaim; model: string }>
  issuer: CreditNoteIssuer
  remember(clientName: string, role: MemoryRole, fact: string, sourceMessageId: string): Promise<unknown>
  reply(message: ChannelMessage, text: string): Promise<void>
}

const ISSUED_STEP = 'credit_issued'
const DECIDE_STEP = 'credit_decide'

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function recordStep(messageId: string, step: string, summary: string, data: unknown, clauses: string[]): void {
  recordEvent({
    id: crypto.randomUUID(),
    message_id: messageId,
    step,
    summary,
    data_json: JSON.stringify(data) ?? 'null',
    policy_clause: clauses.length ? clauses.join(',') : null,
  })
}

function count(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern)
  return match?.[1] ? Number(match[1]) : null
}

export function heuristicDispute(message: ChannelMessage): DisputeClaim {
  const text = message.text
  const lead = String.raw`(\d{1,5})\s+(?:of\s+(?:those|the|these|your)\s+)?(?:\d{1,5}\s+)?(?:leads?\s+)?(?:were|are)\s+`
  const claimedValidCount = count(text, new RegExp(`${lead}(?:valid|good|usable|real)\\b`, 'i'))
  const claimedInvalidCount = count(text, new RegExp(`${lead}(?:invalid|not valid|bad|wrong|duplicates?|unusable|bounced)\\b`, 'i'))
    ?? count(text, /(\d{1,5})\s+(?:invalid|bad|wrong|duplicate|unusable)\s+leads?\b/i)
  const isDispute = claimedValidCount !== null
    || claimedInvalidCount !== null
    || /\b(invalid|not valid|disput\w*|bad leads|wrong leads)\b/i.test(text)
  return { isDispute, claimedValidCount, claimedInvalidCount, quote: text }
}

async function extractDispute(message: ChannelMessage): Promise<{ claim: DisputeClaim; model: string }> {
  const apiKey = process.env.FIREWORKS_API_KEY
  if (!apiKey) return { claim: heuristicDispute(message), model: 'local-fallback' }
  const fireworks = createFireworks({ apiKey })
  const prompt = [
    'Decide whether this client message disputes the quality or validity of delivered leads on an invoice.',
    'claimedValidCount: the number of leads the client says were valid, or null. claimedInvalidCount: the number they say were invalid, or null.',
    'The quote must be an exact substring of the message. Do not invent numbers.',
    `Message author: ${message.author}`,
    `Message: ${message.text}`,
  ].join('\n')
  const models = ['accounts/fireworks/models/deepseek-v4p1-flash', 'accounts/fireworks/models/glm-5p3-flash']
  for (const modelId of models) {
    try {
      const result = await generateObject({ model: fireworks(modelId), schema: disputeClaimSchema, prompt })
      return { claim: result.object, model: modelId }
    } catch (error) {
      console.warn(`Fireworks dispute extraction failed for ${modelId}: ${String(error)}`)
    }
  }
  return { claim: heuristicDispute(message), model: 'local-fallback-after-model-error' }
}

export function stripeCreditNoteIssuer(): CreditNoteIssuer {
  return {
    async create(request, idempotencyKey) {
      const creditNote = await getStripe().creditNotes.create({
        invoice: request.stripeInvoiceId,
        lines: [{
          type: 'custom_line_item',
          description: request.description,
          quantity: request.quantity,
          unit_amount: request.unitAmountPence,
        }],
        reason: 'product_unsatisfactory',
        memo: request.memo,
      }, { idempotencyKey })
      return { id: creditNote.id, totalPence: creditNote.total }
    },
  }
}

export const defaultCreditNoteDeps: CreditNoteDeps = {
  extract: extractDispute,
  issuer: stripeCreditNoteIssuer(),
  remember: (clientName, role, fact, sourceMessageId) => remember(clientName, role, fact, sourceMessageId),
  reply: (message, text) => reply(message, text),
}

export function checkRows(leads: Lead[]): RowCheck[] {
  const seen = new Set<string>()
  return leads.map((lead, index) => {
    const problems: RowProblem[] = []
    if (!lead.name.trim()) problems.push('missing_name')
    if (!lead.company.trim()) problems.push('missing_company')
    if (!lead.url.trim()) problems.push('missing_url')
    const key = `${lead.name}|${lead.company}|${lead.url}`.trim().toLowerCase()
    if (seen.has(key)) problems.push('duplicate')
    seen.add(key)
    return { row: index + 1, problems }
  })
}

function deliveredLeads(invoiceMessageId: string): Lead[] {
  const event = getEvent(invoiceMessageId, 'size')
  if (!event) return []
  const parsed = z.object({ leads: z.array(leadSchema) }).safeParse(JSON.parse(event.data_json))
  return parsed.success ? parsed.data.leads : []
}

function invoiceClientName(invoice: InvoiceRow, message: ChannelMessage): string {
  const event = getEvent(invoice.message_id, 'decide')
  const parsed = event
    ? z.object({ intent: z.object({ clientName: z.string() }) }).safeParse(JSON.parse(event.data_json))
    : null
  return parsed?.success ? parsed.data.intent.clientName : findClient(message.author)?.name ?? message.author
}

export function decideCredit(input: {
  invoice: InvoiceRow
  clientName: string
  claim: DisputeClaim
  delivered: number
  codeInvalid: number
}): CreditDecision {
  const { invoice, claim, delivered } = input
  const claimedInvalid = claim.claimedInvalidCount
    ?? (claim.claimedValidCount !== null ? delivered - claim.claimedValidCount : null)
  const creditedLeads = claimedInvalid === null ? 0 : Math.max(0, Math.min(claimedInvalid, delivered))
  // Net price per delivered lead, so a remembered discount carries into the credit. Floor never over-credits.
  const unitPricePence = delivered > 0 ? Math.floor(invoice.total_pence / delivered) : 0
  const totalPence = creditedLeads * unitPricePence
  const base = {
    invoiceId: invoice.id,
    stripeInvoiceId: invoice.stripe_invoice_id,
    clientName: input.clientName,
    quote: claim.quote,
    delivered,
    claimedInvalid,
    codeInvalid: input.codeInvalid,
    creditedLeads,
    unitPricePence,
    totalPence,
  }
  if (!invoice.stripe_invoice_id) return { ...base, outcome: 'refuse', reason: 'The invoice has no Stripe invoice to credit.' }
  if (creditedLeads === 0) return { ...base, outcome: 'refuse', reason: 'The message does not say how many leads were invalid.' }
  if (totalPence > AUTO_CREDIT_LIMIT_PENCE) {
    return { ...base, outcome: 'needs_approval', reason: `${money(totalPence)} exceeds the ${money(AUTO_CREDIT_LIMIT_PENCE)} auto-credit limit (P11).` }
  }
  return { ...base, outcome: 'auto', reason: `${money(totalPence)} is within the ${money(AUTO_CREDIT_LIMIT_PENCE)} auto-credit limit (P11).` }
}

function savedCreditDecision(messageId: string): CreditDecision | null {
  const event = getEvent(messageId, DECIDE_STEP)
  if (!event) return null
  const parsed = savedCreditSchema.safeParse(JSON.parse(event.data_json))
  return parsed.success ? parsed.data : null
}

function evidence(decision: CreditDecision): string {
  return [
    `Quote: “${decision.quote}”`,
    `Rows checked: ${decision.delivered} delivered; ${decision.codeInvalid} failed our row checks (missing name, company or URL, or duplicate).`,
    `Credited ${decision.creditedLeads} leads at ${money(decision.unitPricePence)} net per lead. Policy: P11.`,
  ].join('\n')
}

// Converges on one credit note per dispute message: the ledger check covers replays, the Stripe idempotency key covers a crash between the call and the ledger write.
async function issueCredit(message: ChannelMessage, decision: CreditDecision, deps: CreditNoteDeps): Promise<void> {
  if (getEvent(message.id, ISSUED_STEP)) return
  if (!decision.stripeInvoiceId) return
  if (await blockIfPaused(message)) return
  try {
    const creditNote = await deps.issuer.create({
      stripeInvoiceId: decision.stripeInvoiceId,
      description: `Credit for ${decision.creditedLeads} invalid leads`,
      quantity: decision.creditedLeads,
      unitAmountPence: decision.unitPricePence,
      memo: `Client dispute: “${decision.quote}”. Credited ${decision.creditedLeads} of ${decision.delivered} delivered leads (P11).`,
    }, `credit-note-${message.id}`)
    recordStep(message.id, ISSUED_STEP, `Issued Stripe credit note ${creditNote.id} for ${money(creditNote.totalPence)}.`, {
      creditNoteId: creditNote.id,
      stripeInvoiceId: decision.stripeInvoiceId,
      totalPence: creditNote.totalPence,
      idempotencyKey: `credit-note-${message.id}`,
    }, ['P11'])
    void noteToStaff(message.id, 'credit_note', `Credited ${decision.clientName} ${money(creditNote.totalPence)} for ${decision.creditedLeads} disputed leads (credit note ${creditNote.id} on invoice ${decision.stripeInvoiceId}). No action needed.`, ['P11'])
    await deps.reply(message, [
      `Credit note ${creditNote.id} issued for ${money(creditNote.totalPence)} against invoice ${decision.stripeInvoiceId}.`,
      evidence(decision),
    ].join('\n'))
  } catch (error) {
    if (!(error instanceof BillingBlockedError)) throw error
    recordStep(message.id, 'billing_blocked', error.message, { totalPence: decision.totalPence }, ['P11'])
    await deps.reply(message, `Credit note blocked: ${error.message}`)
  }
}

/** Returns true when the message disputes delivered leads on this thread's invoice and was handled here. */
export async function handleDispute(message: ChannelMessage, deps: CreditNoteDeps = defaultCreditNoteDeps): Promise<boolean> {
  const invoice = getLatestInvoiceForThread(message.thread)
  if (!invoice || invoice.message_id === message.id) return false

  const prior = savedCreditDecision(message.id)
  if (prior) {
    if (prior.outcome === 'auto') await issueCredit(message, prior, deps)
    markMessageProcessed(message.id)
    return true
  }

  const { claim, model } = await deps.extract(message)
  const quoteValid = claim.quote.length > 0 && message.text.includes(claim.quote)
  if (!claim.isDispute || !quoteValid) return false
  recordStep(message.id, 'dispute_extract', 'Extracted a lead dispute and validated its verbatim quote.', { ...claim, model }, ['P1', 'P11'])

  const leads = deliveredLeads(invoice.message_id)
  const checks = checkRows(leads)
  const failed = checks.filter((check) => check.problems.length > 0)
  recordStep(message.id, 'dispute_check', `Checked ${leads.length} delivered rows; ${failed.length} failed.`, {
    rowsChecked: leads.length,
    failed,
  }, ['P11'])

  const clientName = invoiceClientName(invoice, message)
  const decision = decideCredit({ invoice, clientName, claim, delivered: leads.length, codeInvalid: failed.length })

  const fact = `Disputed invoice ${invoice.stripe_invoice_id ?? invoice.id}: “${claim.quote}”`
  try {
    await deps.remember(clientName, 'collections', fact, message.id)
    recordStep(message.id, 'remember', 'Remembered the dispute for collections, so reminders stop.', { clientName, fact }, ['P7'])
  } catch (error) {
    recordStep(message.id, 'remember', 'Memory write for the dispute failed.', { error: String(error) }, ['P7'])
  }

  recordStep(message.id, DECIDE_STEP, decision.reason, decision, ['P11'])
  if (decision.outcome === 'refuse') {
    await deps.reply(message, `I logged the dispute but did not issue a credit note. ${decision.reason}`)
  } else if (decision.outcome === 'needs_approval') {
    saveApproval({ id: message.id, message_id: message.id, status: 'pending', reason: `Credit note ${decision.reason}` })
    recordStep(message.id, 'approval', 'Requested account-owner approval for the credit note.', { totalPence: decision.totalPence }, ['P11'])
    void noteToStaff(message.id, 'approval', `Approval needed from the account owner: ${money(decision.totalPence)} credit note for ${decision.clientName}. ${decision.reason}`, ['P11'])
    await deps.reply(message, `A credit note of ${money(decision.totalPence)} needs approval. ${decision.reason}\n${evidence(decision)}`)
  } else {
    await issueCredit(message, decision, deps)
  }
  markMessageProcessed(message.id)
  return true
}

/** Returns true when the approval belongs to a credit note and was handled here. */
export async function handleCreditNoteApproval(
  messageId: string,
  action: 'approve' | 'reject',
  deps: CreditNoteDeps = defaultCreditNoteDeps,
): Promise<boolean> {
  const decision = savedCreditDecision(messageId)
  const message = getMessage(messageId)
  if (!decision || !message) return false
  updateApproval(messageId, action === 'approve' ? 'approved' : 'rejected')
  recordStep(messageId, 'approval', action === 'approve' ? 'Account owner approved the credit note.' : 'Account owner rejected the credit note.', { action }, ['P11'])
  if (action === 'approve') await issueCredit(message, decision, deps)
  else await deps.reply(message, 'Credit note rejected. No Stripe credit note was created.')
  markMessageProcessed(messageId)
  return true
}
