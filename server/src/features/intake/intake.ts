import { generateText, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import {
  getEvent,
  listInvoiceAuthors,
  listThreadMessages,
  markMessageProcessed,
  recordEvent,
  saveClientOnce,
  type ChannelMessage,
  type ClientRow,
} from '../ledger/store'
import { reply as channelReply } from '../channels/channel'
import { findClient, type Client } from '../clients/clients'
import { remember, type MemoryRole } from '../memory/memory'
import {
  MINIMUM_ORDER_LEADS,
  STANDARD_PRICE_PER_LEAD_PENCE,
  recallCompanyFacts,
  type CompanyFact,
} from '../memory/company'
import { datasetName } from '../memory/providers/cognee'
import type { BillableIntent, Decision } from '../policy/decide'

// P12: a new client is onboarded from the company knowledge base at the standard
// price list, with no discounts, and its first invoice always needs account-owner approval.
// Step names are shared with the Notifications page (SYNC.md): company_learned, client_identified, onboard.
export const INTAKE_STEP = 'intake'
export const COMPANY_LEARNED_STEP = 'company_learned'
export const CLIENT_IDENTIFIED_STEP = 'client_identified'
export const ONBOARD_STEP = 'onboard'
export const P12 = 'P12'

const inquirySchema = z.object({
  isInquiry: z.boolean(),
  companyName: z.string(),
  ask: z.string(),
  quantity: z.number().int().nullable(),
  quote: z.string(),
})
export type InquiryExtraction = z.infer<typeof inquirySchema>

export interface IntakeDeps {
  extract(message: ChannelMessage): Promise<{ inquiry: InquiryExtraction; model: string }>
  recallCompany(query: string): Promise<CompanyFact[]>
  remember(clientName: string, role: MemoryRole, fact: string, sourceMessageId: string): Promise<unknown>
  reply(message: ChannelMessage, text: string): Promise<void>
  accountOwner: string
}

const INQUIRY_PATTERN = /what do you charge|price|pricing|how much|need|looking for|do you (?:sell|offer|do)|\?/i
const COMMITMENT_PATTERN = /\b(let'?s|go ahead|order|kick off|please proceed)\b/i
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i

export function companyNameFromAuthor(author: string): string {
  return author.replace(/^client\s*[—–-]\s*/i, '').replace(/\s*\(.*\)\s*$/, '').trim() || author.trim()
}

export function heuristicInquiry(message: ChannelMessage): InquiryExtraction {
  const quantityMatch = message.text.match(/\b(\d{1,5})\s+(?:[a-z]+\s+){0,3}leads?\b/i)
  const quantity = quantityMatch?.[1] ? Number(quantityMatch[1]) : null
  const commits = COMMITMENT_PATTERN.test(message.text) && quantity !== null
  return {
    isInquiry: !commits && INQUIRY_PATTERN.test(message.text),
    companyName: companyNameFromAuthor(message.author),
    ask: message.text,
    quantity,
    quote: message.text,
  }
}

async function extractInquiry(message: ChannelMessage): Promise<{ inquiry: InquiryExtraction; model: string }> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) return { inquiry: heuristicInquiry(message), model: 'local-fallback' }
  const modelId = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'
  const prompt = [
    'A message arrived from a sender we have never billed. Classify it.',
    'isInquiry is true when the sender asks a question or states a need about our services or prices.',
    'isInquiry is false when the sender commits to an order ("let\'s do 300", "go ahead") or the message is unrelated.',
    'companyName is the sender\'s company if it can be read from the author or the text, else the author.',
    'quantity is the number of leads mentioned, or null. The quote must be an exact substring of the message.',
    `Message author: ${message.author}`,
    `Message: ${message.text}`,
  ].join('\n')
  try {
    const { output } = await generateText({
      model: createOpenAI({ apiKey: openaiKey })(modelId),
      output: Output.object({ schema: inquirySchema }),
      prompt,
    })
    return { inquiry: output, model: modelId }
  } catch (error) {
    console.warn(`Intake extraction failed for ${modelId}: ${String(error)}`)
    return { inquiry: heuristicInquiry(message), model: 'local-fallback-after-model-error' }
  }
}

export const defaultDeps: IntakeDeps = {
  extract: extractInquiry,
  recallCompany: (query) => recallCompanyFacts(query),
  remember: (clientName, role, fact, source) => remember(clientName, role, fact, source),
  reply: (message, text) => channelReply(message, text),
  accountOwner: 'Bulut',
}

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function factFor(facts: CompanyFact[], topic: CompanyFact['topic']): string | null {
  return facts.find((entry) => entry.topic === topic)?.fact ?? null
}

// Code assembles the answer from facts; the only free text is the clarifying question.
export function composeIntakeReply(companyName: string, inquiry: InquiryExtraction, facts: CompanyFact[]): { text: string; clarifying: string } {
  const price = factFor(facts, 'price') ?? `Standard price is ${money(STANDARD_PRICE_PER_LEAD_PENCE)} per lead.`
  const minimum = factFor(facts, 'minimum') ?? `Minimum order is ${MINIMUM_ORDER_LEADS} leads.`
  const terms = factFor(facts, 'terms')
  const vat = factFor(facts, 'vat')
  const services = factFor(facts, 'services')
  const lines = [`Thanks ${companyName}. ${services ?? ''}`.trim(), `${price} ${minimum}`]
  if (terms) lines.push(terms)
  if (vat) lines.push(vat)
  const quantity = inquiry.quantity
  const clarifying = quantity && quantity >= MINIMUM_ORDER_LEADS
    ? `For ${quantity} leads that is ${money(quantity * STANDARD_PRICE_PER_LEAD_PENCE)} net. Who is the ideal customer (role, sector, location) so I can confirm the quote?`
    : quantity
      ? `${quantity} is under the minimum of ${MINIMUM_ORDER_LEADS} leads. How many leads do you need, and who is the ideal customer (role, sector, location)?`
      : 'How many leads do you need, and who is the ideal customer (role, sector, location)?'
  lines.push(clarifying)
  return { text: lines.join('\n'), clarifying }
}

function recordStep(messageId: string, step: string, summary: string, data: unknown, clauses: string[] = []): void {
  recordEvent({
    id: crypto.randomUUID(),
    message_id: messageId,
    step,
    summary,
    data_json: JSON.stringify(data) ?? 'null',
    policy_clause: clauses.length ? clauses.join(',') : null,
  })
}

// Answers an unknown sender's question from the company knowledge base. Returns false for known
// clients, commitments, and anything that is not an inquiry, so the normal path continues.
export async function handleIntake(message: ChannelMessage, overrides: Partial<IntakeDeps> = {}): Promise<boolean> {
  const deps = { ...defaultDeps, ...overrides }
  if (message.author === 'tally' || findClient(message.author)) return false
  const extracted = await deps.extract(message)
  const inquiry = extracted.inquiry
  const quoteValid = inquiry.quote.length > 0 && message.text.includes(inquiry.quote)
  const commits = COMMITMENT_PATTERN.test(message.text) && /\b\d{1,5}\b/.test(message.text)
  if (!inquiry.isInquiry || !quoteValid || commits) return false

  const companyName = inquiry.companyName.trim() || companyNameFromAuthor(message.author)
  const facts = await deps.recallCompany(inquiry.ask)
  const composed = composeIntakeReply(companyName, inquiry, facts)
  recordStep(message.id, COMPANY_LEARNED_STEP, `Answered ${companyName}'s question from the company knowledge base: ${money(STANDARD_PRICE_PER_LEAD_PENCE)} per lead, minimum ${MINIMUM_ORDER_LEADS}, 7-day terms.`, {
    companyName,
    ask: inquiry.ask,
    quantity: inquiry.quantity,
    quote: inquiry.quote,
    model: extracted.model,
    facts,
    pricePerLeadPence: STANDARD_PRICE_PER_LEAD_PENCE,
  }, [P12])
  recordStep(message.id, INTAKE_STEP, `Asked ${companyName} the one question needed to quote: ${composed.clarifying}`, {
    companyName,
    ask: inquiry.ask,
    quantity: inquiry.quantity,
    clarifying: composed.clarifying,
  }, [P12])
  await deps.reply(message, composed.text)
  markMessageProcessed(message.id)
  return true
}

// Records 'client_identified' the first time a thread's sender is matched to a known client.
export function identifyClient(message: ChannelMessage, extractedName: string): Client | null {
  const client = findClient(message.author) ?? findClient(extractedName)
  if (!client) return null
  const alreadyIdentified = listThreadMessages(message.thread)
    .some((prior) => prior.id !== message.id && getEvent(prior.id, CLIENT_IDENTIFIED_STEP) !== null)
  if (!alreadyIdentified) {
    recordStep(message.id, CLIENT_IDENTIFIED_STEP, `Matched the sender to ${client.name} (${client.source === 'seed' ? 'seeded' : 'onboarded'} client, ${money(client.pricePerLeadPence)} per lead).`, {
      clientName: client.name,
      author: message.author,
      source: client.source,
    }, ['P5'])
  }
  return client
}

function threadHadIntake(message: ChannelMessage): { companyName: string; sourceMessageId: string } | null {
  for (const prior of listThreadMessages(message.thread)) {
    if (prior.author !== message.author) continue
    const event = getEvent(prior.id, INTAKE_STEP)
    if (!event) continue
    const parsed = z.object({ companyName: z.string() }).safeParse(JSON.parse(event.data_json))
    return { companyName: parsed.success ? parsed.data.companyName : companyNameFromAuthor(message.author), sourceMessageId: prior.id }
  }
  return null
}

function aliasesFor(name: string, author: string): string[] {
  const stop = new Set(['client', 'the', 'ltd', 'limited', 'inc', 'llc', 'plc', 'co', 'company'])
  const words = `${name} ${companyNameFromAuthor(author)}`.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !stop.has(word))
  return [...new Set(words)]
}

// Creates the client row once the sender who inquired commits. A cold commitment with no intake
// conversation in the thread stays unknown, so P5 still refuses it.
export async function onboardClient(message: ChannelMessage, intent: BillableIntent, overrides: Partial<IntakeDeps> = {}): Promise<Client | null> {
  const deps = { ...defaultDeps, ...overrides }
  const known = findClient(message.author)
  if (known) return known
  const intake = threadHadIntake(message)
  if (!intake) return null
  const name = intake.companyName
  const id = datasetName(name)
  const email = message.text.match(EMAIL_PATTERN)?.[0] ?? `billing+${id}@example.com`
  const row: Omit<ClientRow, 'created_at'> = {
    id,
    name,
    aliases_json: JSON.stringify(aliasesFor(name, message.author)),
    billing_email: email,
    price_per_lead_pence: STANDARD_PRICE_PER_LEAD_PENCE,
    account_owner: deps.accountOwner,
    source_message_id: message.id,
  }
  const created = saveClientOnce(row)
  const client = findClient(name)
  if (!client) return null
  if (created) {
    recordStep(message.id, ONBOARD_STEP, `Onboarded ${name} at the standard price list (${money(STANDARD_PRICE_PER_LEAD_PENCE)} per lead).`, {
      client: row,
      intakeMessageId: intake.sourceMessageId,
      quote: intent.quote,
    }, [P12])
    try {
      await deps.remember(name, 'sales', `Onboarded as a new client at the standard price list (${money(STANDARD_PRICE_PER_LEAD_PENCE)} per lead, no discounts); first ask: ${intent.ask}`, message.id)
    } catch (error) {
      recordStep(message.id, ONBOARD_STEP, 'Client memory write failed.', { error: String(error) })
    }
  }
  return client
}

export function hasPriorInvoice(client: Client): boolean {
  return listInvoiceAuthors().some((author) => findClient(author)?.name === client.name)
}

// P12: an onboarded client's first invoice needs approval even when P4 would auto-send it.
export function gateFirstInvoice(client: Client | null, decision: Decision): Decision {
  if (!client || client.source !== 'intake' || decision.outcome === 'refuse') return decision
  if (hasPriorInvoice(client)) return decision
  const firstInvoice = `${money(decision.totalPence)} is the first invoice for new client ${client.name}; the account owner approves it.`
  return {
    ...decision,
    outcome: 'needs_approval',
    clauses: [...decision.clauses, P12],
    reason: decision.outcome === 'auto' ? firstInvoice : `${decision.reason} ${firstInvoice}`,
  }
}
