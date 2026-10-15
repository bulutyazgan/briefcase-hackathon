import { generateText, Output, type LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createFireworks } from '@ai-sdk/fireworks'
import { z } from 'zod'
import { CLIENTS, findClient, type Client } from '../clients/clients'
import { reply } from '../channels/channel'
import {
  getInvoice,
  getLatestThreadForAuthor,
  getMessage,
  listEventsByStep,
  markMessageProcessed,
  recordEvent,
  saveApproval,
  updateApproval,
  type ChannelMessage,
  type EventRow,
} from '../ledger/store'
import { recall, type RoleFact } from '../memory/memory'
import type { BillableIntent } from '../policy/decide'
import { regexDiscountTerms, validateDiscount } from '../pricing/discount'
import { priceOrder } from '../pricing/pricing'
import { createTregClient } from '../leads/providers/treg/treg-client'

// Opportunities: code spots revenue (cadence, channel need, buying signal), policy gates the offer,
// and the client's explicit acceptance in the same thread hands the order to the commitment path.

export const OPPORTUNITY_STEP = 'opportunity'
export const OFFER_STEP = 'offer'
export const GATE_STEP = 'opportunity_gate'
export const CHECKED_STEP = 'opportunity_checked'
export const AUTO_OFFER_LIMIT_PENCE = 100000
export const OFFER_TTL_MS = 7 * 86400000
export const COOLDOWN_MS = 7 * 86400000
export const CADENCE_DAYS = 90
export const SIGNAL_CALL_CAP_MICRO = 50_000

export const opportunityStatuses = ['spotted', 'offered', 'accepted', 'declined', 'expired'] as const
export type OpportunityStatus = typeof opportunityStatuses[number]

const evidenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cadence'), facts: z.array(z.string()), lastDelivered: z.string(), daysSince: z.number() }),
  z.object({ kind: z.literal('channel'), quote: z.string(), messageId: z.string() }),
  z.object({ kind: z.literal('signal'), accountIds: z.array(z.string()), count: z.number() }),
])
export type OpportunityEvidence = z.infer<typeof evidenceSchema>

const opportunitySchema = z.object({
  id: z.string(),
  clientName: z.string(),
  service: z.literal('lead-list'),
  quantity: z.number().int(),
  pricePence: z.number(),
  discountNote: z.string(),
  icp: z.string(),
  rationale: z.string(),
  evidence: evidenceSchema,
  status: z.enum(opportunityStatuses),
  clauses: z.array(z.string()),
  thread: z.string().nullable(),
  spottedAt: z.string(),
  offeredAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  acceptanceMessageId: z.string().nullable(),
})
export type Opportunity = z.infer<typeof opportunitySchema>

export interface NeedExtraction {
  hasNeed: boolean
  service: 'lead-list' | 'other'
  quantity: number | null
  quote: string
}

export interface AcceptanceExtraction {
  accepts: boolean
  declines: boolean
}

export interface OpportunityDeps {
  clients: readonly Client[]
  recall(clientName: string): Promise<RoleFact[]>
  listOpportunities(): Opportunity[]
  save(opportunity: Opportunity): void
  recordGate(opportunity: Opportunity, clause: string, summary: string): void
  recentNeedMessages(): ChannelMessage[]
  extractNeed(message: ChannelMessage): Promise<NeedExtraction>
  markChecked(message: ChannelMessage, need: NeedExtraction): void
  // null means the signal source is off (no token) or capped for today.
  countFundedAccounts(client: Client, icp: string, now: Date): Promise<{ count: number; accountIds: string[] } | null>
  post(opportunity: Opportunity, text: string): Promise<string>
  requestApproval(opportunity: Opportunity, reason: string): void
}

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

// The latest `opportunity` event per id is the current state.
export function opportunitiesFromEvents(events: EventRow[]): Opportunity[] {
  const latest = new Map<string, Opportunity>()
  for (const event of events) {
    const parsed = opportunitySchema.safeParse(JSON.parse(event.data_json))
    if (parsed.success) latest.set(parsed.data.id, parsed.data)
  }
  return [...latest.values()]
}

export function listOpportunities(): Opportunity[] {
  return opportunitiesFromEvents(listEventsByStep(OPPORTUNITY_STEP))
}

function saveOpportunity(opportunity: Opportunity): void {
  recordStep(opportunity.id, OPPORTUNITY_STEP, `Opportunity ${opportunity.status}: ${opportunity.rationale}`, opportunity, opportunity.clauses)
}

export function isOpen(opportunity: Opportunity): boolean {
  return opportunity.status === 'spotted' || opportunity.status === 'offered'
}

export function offerText(opportunity: Opportunity): string {
  return `Opportunity: ${opportunity.rationale}. Offer ${opportunity.quantity} ${opportunity.service} at ${money(opportunity.pricePence)} (${opportunity.discountNote}) + VAT. Reply 'yes' or 'go ahead' to accept. Offer ${opportunity.id} expires in 7 days.`
}

const NEED_PATTERN = /launch|pipeline|expand|new market|more leads/i
const ACCEPT_PATTERN = /\b(yes|go ahead|accept|do it|let'?s do it)\b/i
const DECLINE_PATTERN = /\b(no|not now|no thanks|pass|decline)\b/i

export function heuristicNeed(message: ChannelMessage): NeedExtraction {
  const quantityMatch = message.text.match(/\b(\d{1,5})\s+(?:more\s+)?leads?\b/i)
  return {
    hasNeed: NEED_PATTERN.test(message.text),
    service: 'lead-list',
    quantity: quantityMatch?.[1] ? Number(quantityMatch[1]) : null,
    quote: message.text,
  }
}

export function heuristicAcceptance(text: string): AcceptanceExtraction {
  const accepts = ACCEPT_PATTERN.test(text)
  return { accepts: accepts && !DECLINE_PATTERN.test(text), declines: !accepts && DECLINE_PATTERN.test(text) }
}

function languageModels(): Array<{ id: string; model: LanguageModel }> {
  const candidates: Array<{ id: string; model: LanguageModel }> = []
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    const modelId = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'
    candidates.push({ id: modelId, model: createOpenAI({ apiKey: openaiKey })(modelId) })
  }
  const fireworksKey = process.env.FIREWORKS_API_KEY
  if (fireworksKey) {
    const fireworks = createFireworks({ apiKey: fireworksKey })
    candidates.push({ id: 'accounts/fireworks/models/deepseek-v4p1-flash', model: fireworks('accounts/fireworks/models/deepseek-v4p1-flash') })
  }
  return candidates
}

async function extractWithModels<T>(schema: z.ZodType<T>, prompt: string): Promise<T | null> {
  for (const candidate of languageModels()) {
    try {
      const { output } = await generateText({ model: candidate.model, output: Output.object({ schema }), prompt })
      return output
    } catch (error) {
      console.warn(`Opportunity extraction failed for ${candidate.id}: ${String(error)}`)
    }
  }
  return null
}

const needSchema = z.object({
  hasNeed: z.boolean(),
  service: z.enum(['lead-list', 'other']),
  quantity: z.number().int().nullable(),
  quote: z.string(),
})

async function extractNeed(message: ChannelMessage): Promise<NeedExtraction> {
  const output = await extractWithModels(needSchema, [
    'Does this client message express an upcoming need for more sales leads (a launch, a thin pipeline, expansion, a new market)? It is NOT an order.',
    'quote must be an exact substring of the message. quantity only if the message states a number of leads.',
    `Message author: ${message.author}`,
    `Message: ${message.text}`,
  ].join('\n'))
  if (output && output.quote.length > 0 && message.text.includes(output.quote)) return output
  return heuristicNeed(message)
}

const acceptanceSchema = z.object({ accepts: z.boolean(), declines: z.boolean() })

async function extractAcceptance(message: ChannelMessage, offer: string): Promise<AcceptanceExtraction> {
  const output = await extractWithModels(acceptanceSchema, [
    'Tally posted this offer in the thread. Does the client message accept it (yes, go ahead) or decline it (no, not now)? Both false if neither.',
    `Offer: ${offer}`,
    `Message: ${message.text}`,
  ].join('\n'))
  return output ?? heuristicAcceptance(message.text)
}

function parseDbDate(value: string): Date {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}Z`)
}

function recentNeedMessages(): ChannelMessage[] {
  // A message is a candidate once the agent loop has extracted it and found no commitment.
  const checked = new Set(listEventsByStep(CHECKED_STEP).map((event) => event.message_id))
  const extracts = listEventsByStep('extract').filter((event) => Date.now() - parseDbDate(event.created_at).getTime() < 7 * 86400000)
  const messages: ChannelMessage[] = []
  for (const event of extracts) {
    const parsed = z.object({ isCommitment: z.boolean(), quoteValid: z.boolean() }).safeParse(JSON.parse(event.data_json))
    if (!parsed.success || (parsed.data.isCommitment && parsed.data.quoteValid)) continue
    if (checked.has(event.message_id)) continue
    const message = getMessage(event.message_id)
    if (message && message.author !== 'tally') messages.push(message)
  }
  return messages
}

const signalCalls = new Map<string, string>()

async function countFundedAccounts(client: Client, icp: string, now: Date): Promise<{ count: number; accountIds: string[] } | null> {
  const token = process.env.TREG_TOKEN
  if (!token) return null
  const today = now.toISOString().slice(0, 10)
  if (signalCalls.get(client.name) === today) return null
  signalCalls.set(client.name, today)
  const since = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)
  const result = await createTregClient({ token }).call('apollo.companies.news', {
    'categories[]': ['receives_financing'],
    'published_at[min]': since,
    per_page: 10,
    q_organization_keyword_tags: icp,
  }, SIGNAL_CALL_CAP_MICRO)
  const body = z.object({ news_articles: z.array(z.object({ organization_ids: z.array(z.string()).default([]) })) }).safeParse(result.body)
  if (!body.success) return { count: 0, accountIds: [] }
  const accountIds = [...new Set(body.data.news_articles.flatMap((article) => article.organization_ids))]
  return { count: accountIds.length, accountIds }
}

function clientAuthorThread(client: Client): string | null {
  for (const author of [`Client — ${client.name.split(' ')[0]}`, client.name]) {
    const thread = getLatestThreadForAuthor('simulator', author)
    if (thread) return thread
  }
  return null
}

export const defaultDeps: OpportunityDeps = {
  clients: CLIENTS,
  async recall(clientName) {
    const query = 'order cadence, saved ICP, agreed discounts, disputes'
    try {
      return await recall(clientName, query)
    } catch (error) {
      console.warn(`Opportunity recall fell back to local memory: ${String(error)}`)
      return recall(clientName, query, undefined, { cognee: null })
    }
  },
  listOpportunities,
  save: saveOpportunity,
  recordGate(opportunity, clause, summary) {
    recordStep(opportunity.id, GATE_STEP, summary, { opportunityId: opportunity.id, clientName: opportunity.clientName, clause }, [clause])
  },
  recentNeedMessages,
  extractNeed,
  markChecked(message, need) {
    recordStep(message.id, CHECKED_STEP, 'Checked the message for a lead need; none found.', need, [])
  },
  countFundedAccounts,
  async post(opportunity, text) {
    const client = findClient(opportunity.clientName)
    const thread = (client && clientAuthorThread(client)) ?? opportunity.id
    const source: ChannelMessage = {
      id: opportunity.id, channel: 'simulator', thread, author: 'tally', text: '', ts: new Date().toISOString(), processed_at: null,
    }
    await reply(source, text)
    return thread
  },
  requestApproval(opportunity, reason) {
    saveApproval({ id: opportunity.id, message_id: opportunity.id, status: 'pending', reason })
  },
}

function savedQuantity(facts: RoleFact[]): number | null {
  for (const fact of facts) {
    const match = fact.fact.match(/(\d{1,5})\s+leads/i)
    if (match?.[1]) return Number(match[1])
  }
  return null
}

function savedIcp(facts: RoleFact[]): string {
  const fact = facts.find((entry) => /saved icp:/i.test(entry.fact))
  return fact ? fact.fact.replace(/^.*saved icp:\s*/i, '').trim() : 'leads matching the saved profile'
}

function priced(client: Client, facts: RoleFact[], quantity: number): { pricePence: number; discountNote: string } {
  const discount = validateDiscount(regexDiscountTerms(facts), quantity, facts)
  const price = priceOrder(client, quantity, discount.percent)
  return {
    pricePence: price.netPence,
    discountNote: discount.percent > 0 ? `${discount.percent}% off as agreed, ${discount.memoryFact}` : 'standard price list, no discount applies',
  }
}

function newOpportunity(
  client: Client,
  facts: RoleFact[],
  quantity: number,
  rationale: string,
  evidence: OpportunityEvidence,
  now: Date,
): Opportunity {
  const price = priced(client, facts, quantity)
  return {
    id: `opp-${evidence.kind}-${crypto.randomUUID().slice(0, 8)}`,
    clientName: client.name,
    service: 'lead-list',
    quantity,
    pricePence: price.pricePence,
    discountNote: price.discountNote,
    icp: savedIcp(facts),
    rationale,
    evidence,
    status: 'spotted',
    clauses: ['O1', 'P2', 'P3'],
    thread: null,
    spottedAt: now.toISOString(),
    offeredAt: null,
    expiresAt: null,
    closedAt: null,
    acceptanceMessageId: null,
  }
}

const CADENCE_PATTERN = /last list delivered (\d{4}-\d{2}-\d{2})/i

export function spotCadence(client: Client, facts: RoleFact[], now: Date): Opportunity | null {
  const fact = facts.find((entry) => CADENCE_PATTERN.test(entry.fact))
  const match = fact?.fact.match(CADENCE_PATTERN)
  if (!fact || !match?.[1]) return null
  const lastDelivered = match[1]
  const daysSince = Math.floor((now.getTime() - Date.parse(lastDelivered)) / 86400000)
  if (daysSince < CADENCE_DAYS) return null
  const quantity = savedQuantity([fact, ...facts]) ?? 100
  return newOpportunity(client, facts, quantity, `${client.name} refreshes its list every quarter and the last one was delivered ${daysSince} days ago (${lastDelivered})`, {
    kind: 'cadence', facts: [fact.fact], lastDelivered, daysSince,
  }, now)
}

function spotChannel(client: Client, facts: RoleFact[], message: ChannelMessage, need: NeedExtraction, now: Date): Opportunity | null {
  if (!need.hasNeed || need.service !== 'lead-list') return null
  if (!need.quote || !message.text.includes(need.quote)) return null
  const quantity = need.quantity ?? savedQuantity(facts) ?? 100
  return newOpportunity(client, facts, quantity, `${client.name} said “${need.quote}”, which reads as a need for fresh leads`, {
    kind: 'channel', quote: need.quote, messageId: message.id,
  }, now)
}

// O3: one open offer per client, 7-day cooldown after a decline or expiry, never while a dispute is remembered.
export function gateO3(candidate: Opportunity, existing: Opportunity[], facts: RoleFact[], now: Date): string | null {
  const mine = existing.filter((entry) => entry.clientName === candidate.clientName && entry.id !== candidate.id)
  if (facts.some((entry) => entry.role === 'collections' && /disput/i.test(entry.fact))) return 'a dispute is remembered for this client'
  if (mine.some((entry) => entry.status === 'offered')) return 'the client already has an open offer'
  const cooled = mine.find((entry) => (entry.status === 'declined' || entry.status === 'expired') && entry.closedAt
    && now.getTime() - Date.parse(entry.closedAt) < COOLDOWN_MS)
  if (cooled) return `cooldown after ${cooled.status} offer ${cooled.id}`
  return null
}

export type TickOutcome = { id: string; action: 'spotted' | 'offered' | 'approval' | 'gated' | 'expired'; reason?: string }

async function tryOffer(opportunity: Opportunity, facts: RoleFact[], now: Date, deps: OpportunityDeps, outcomes: TickOutcome[]): Promise<void> {
  const blocked = gateO3(opportunity, deps.listOpportunities(), facts, now)
  if (blocked) {
    deps.recordGate(opportunity, 'O3', `Held offer ${opportunity.id}: ${blocked}.`)
    outcomes.push({ id: opportunity.id, action: 'gated', reason: blocked })
    return
  }
  if (opportunity.pricePence > AUTO_OFFER_LIMIT_PENCE) {
    const reason = `Offer ${opportunity.id} to ${opportunity.clientName} for ${money(opportunity.pricePence)} exceeds the £1,000 auto-offer limit (O2).`
    deps.recordGate(opportunity, 'O2', reason)
    deps.requestApproval(opportunity, reason)
    outcomes.push({ id: opportunity.id, action: 'approval' })
    return
  }
  deps.recordGate(opportunity, 'O2', `Offer ${opportunity.id} for ${money(opportunity.pricePence)} is within the £1,000 auto-offer limit.`)
  await postOffer(opportunity, now, deps)
  outcomes.push({ id: opportunity.id, action: 'offered' })
}

async function postOffer(opportunity: Opportunity, now: Date, deps: OpportunityDeps): Promise<Opportunity> {
  const offered: Opportunity = {
    ...opportunity,
    status: 'offered',
    offeredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + OFFER_TTL_MS).toISOString(),
    clauses: [...new Set([...opportunity.clauses, 'O2', 'O3'])],
  }
  const thread = await deps.post(offered, offerText(offered))
  const posted = { ...offered, thread }
  deps.save(posted)
  recordStep(posted.id, OFFER_STEP, `Posted offer ${posted.id} to ${posted.clientName} for ${money(posted.pricePence)}.`, { ...posted, text: offerText(posted) }, posted.clauses)
  return posted
}

export async function runOpportunityTick(now: Date, overrides: Partial<OpportunityDeps> = {}): Promise<TickOutcome[]> {
  const deps: OpportunityDeps = { ...defaultDeps, ...overrides }
  const outcomes: TickOutcome[] = []
  const existing = deps.listOpportunities()

  for (const entry of existing) {
    if (entry.status === 'offered' && entry.expiresAt && Date.parse(entry.expiresAt) <= now.getTime()) {
      deps.save({ ...entry, status: 'expired', closedAt: now.toISOString() })
      deps.recordGate(entry, 'O3', `Offer ${entry.id} expired; 7-day cooldown starts.`)
      outcomes.push({ id: entry.id, action: 'expired' })
    }
  }

  const needMessages = deps.recentNeedMessages()
  for (const client of deps.clients) {
    const facts = await deps.recall(client.name)
    const candidates: Opportunity[] = []

    const cadence = spotCadence(client, facts, now)
    if (cadence && !existing.some((entry) => entry.clientName === client.name && entry.evidence.kind === 'cadence' && isOpen(entry))) {
      candidates.push(cadence)
    }

    for (const message of needMessages) {
      if (findClient(message.author)?.name !== client.name) continue
      if (existing.some((entry) => entry.evidence.kind === 'channel' && entry.evidence.messageId === message.id)) continue
      const need = await deps.extractNeed(message)
      const spotted = spotChannel(client, facts, message, need, now)
      if (spotted) candidates.push(spotted)
      else deps.markChecked(message, need)
    }

    if (!existing.some((entry) => entry.clientName === client.name && entry.evidence.kind === 'signal' && isOpen(entry))) {
      try {
        const funded = await deps.countFundedAccounts(client, savedIcp(facts), now)
        if (funded && funded.count > 0) {
          candidates.push(newOpportunity(client, facts, savedQuantity(facts) ?? 100, `${funded.count} of your target accounts raised this month`, {
            kind: 'signal', accountIds: funded.accountIds, count: funded.count,
          }, now))
        }
      } catch (error) {
        console.warn(`Signal spotter failed for ${client.name}: ${String(error)}`)
      }
    }

    for (const candidate of candidates) {
      // O1: known clients (the seeded list) and catalogue services only; the spotters only produce lead-list.
      deps.recordGate(candidate, 'O1', `Spotted ${candidate.evidence.kind} opportunity for known client ${client.name} (lead-list).`)
      deps.save(candidate)
      outcomes.push({ id: candidate.id, action: 'spotted' })
      await tryOffer(candidate, facts, now, deps, outcomes)
    }
  }
  return outcomes
}

export function intentFromOffer(opportunity: Opportunity, message: ChannelMessage): BillableIntent {
  return {
    isCommitment: true,
    clientName: opportunity.clientName,
    ask: `${opportunity.quantity} leads: ${opportunity.icp} (accepted offer ${opportunity.id})`,
    icp: opportunity.icp,
    signals: [],
    quantity: opportunity.quantity,
    quote: message.text,
  }
}

export interface AcceptanceDeps {
  listOpportunities(): Opportunity[]
  extractAcceptance(message: ChannelMessage, offer: string): Promise<AcceptanceExtraction>
  save(opportunity: Opportunity): void
  reply(message: ChannelMessage, text: string): Promise<void>
  markProcessed(messageId: string): void
  now(): Date
}

const defaultAcceptanceDeps: AcceptanceDeps = {
  listOpportunities,
  extractAcceptance,
  save: saveOpportunity,
  reply,
  markProcessed: markMessageProcessed,
  now: () => new Date(),
}

/** O4: returns true when the message answered an open offer in its own thread and was handled here. */
export async function handleOfferAcceptance(
  message: ChannelMessage,
  bill: (message: ChannelMessage, intent: BillableIntent) => Promise<void>,
  overrides: Partial<AcceptanceDeps> = {},
): Promise<boolean> {
  const deps = { ...defaultAcceptanceDeps, ...overrides }
  if (message.author === 'tally') return false
  const now = deps.now()
  const offer = deps.listOpportunities().find((entry) => entry.status === 'offered' && entry.thread === message.thread
    && (!entry.expiresAt || Date.parse(entry.expiresAt) > now.getTime()))
  if (!offer) return false
  const verdict = await deps.extractAcceptance(message, offerText(offer))
  if (!verdict.accepts && !verdict.declines) return false

  if (verdict.declines) {
    deps.save({ ...offer, status: 'declined', closedAt: now.toISOString(), clauses: [...new Set([...offer.clauses, 'O3'])] })
    recordStep(message.id, 'offer_declined', `Client declined offer ${offer.id}; 7-day cooldown starts (O3).`, { opportunityId: offer.id, quote: message.text }, ['O3'])
    await deps.reply(message, `Understood, offer ${offer.id} is withdrawn. I will not raise it again for 7 days.`)
    deps.markProcessed(message.id)
    return true
  }

  const accepted: Opportunity = { ...offer, status: 'accepted', closedAt: now.toISOString(), acceptanceMessageId: message.id, clauses: [...new Set([...offer.clauses, 'O4'])] }
  deps.save(accepted)
  recordStep(message.id, 'offer_accepted', `Client accepted offer ${offer.id} in the same thread with “${message.text}” (O4).`, { opportunityId: offer.id, quote: message.text }, ['O4', 'P1'])
  await bill(message, intentFromOffer(accepted, message))
  deps.markProcessed(message.id)
  return true
}

/** O2: returns true when the approval belongs to an opportunity offer and was handled here. */
export async function handleOfferApproval(opportunityId: string, action: 'approve' | 'reject', overrides: Partial<OpportunityDeps> = {}): Promise<boolean> {
  const deps: OpportunityDeps = { ...defaultDeps, ...overrides }
  const opportunity = deps.listOpportunities().find((entry) => entry.id === opportunityId)
  if (!opportunity || opportunity.status !== 'spotted') return false
  updateApproval(opportunityId, action === 'approve' ? 'approved' : 'rejected')
  if (action === 'approve') {
    deps.recordGate(opportunity, 'O2', `Account owner approved offer ${opportunity.id} above the auto-offer limit.`)
    await postOffer(opportunity, new Date(), deps)
  } else {
    deps.recordGate(opportunity, 'O2', `Account owner rejected offer ${opportunity.id}.`)
    deps.save({ ...opportunity, status: 'declined', closedAt: new Date().toISOString() })
  }
  return true
}

export interface OpportunityView extends Opportunity {
  invoiceId: string | null
  gateEvents: Array<{ clause: string; summary: string; at: string }>
}

// For the API: status, evidence and clause trail, never a provider name.
export function listOpportunityViews(): OpportunityView[] {
  const gates = listEventsByStep(GATE_STEP)
  return listOpportunities().map((opportunity) => ({
    ...opportunity,
    invoiceId: opportunity.acceptanceMessageId && getInvoice(opportunity.acceptanceMessageId) ? opportunity.acceptanceMessageId : null,
    gateEvents: gates.filter((event) => event.message_id === opportunity.id)
      .map((event) => ({ clause: event.policy_clause ?? '', summary: event.summary, at: event.created_at })),
  })).sort((a, b) => b.spottedAt.localeCompare(a.spottedAt))
}
