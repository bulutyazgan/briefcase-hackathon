import { describe, expect, test } from 'bun:test'
import type { ChannelMessage } from '../ledger/store'
import type { RoleFact } from '../memory/memory'
import type { BillableIntent } from '../policy/decide'
import { CLIENTS, findClient } from '../clients/clients'
import {
  gateO3,
  handleOfferAcceptance,
  runOpportunityTick,
  spotCadence,
  type Opportunity,
  type OpportunityDeps,
} from './opportunities'

const northwind = findClient('Northwind Capital') ?? CLIENTS[0]

function fact(text: string, role: RoleFact['role'] = 'sales', date = '2026-07-14'): RoleFact {
  return { clientName: 'Northwind Capital', fact: text, role, date, sourceMessageId: `src-${text.length}` }
}

const cadenceFact = fact('Orders a fresh list of 200 leads every quarter; last list delivered 2026-07-14')
const discountFact = fact('Agreed 10% off orders over 200 leads')
const icpFact = fact('Saved ICP: fintech CFOs in London')

function message(text: string, thread = 'thread-1', author = 'Client — Northwind'): ChannelMessage {
  return { id: `msg-${text.length}-${thread}`, channel: 'simulator', thread, author, text, ts: '2026-10-15T10:00:00Z', processed_at: null }
}

function harness(facts: RoleFact[], seed: Opportunity[] = [], needMessages: ChannelMessage[] = []) {
  const saved: Opportunity[] = [...seed]
  const gates: string[] = []
  const posted: string[] = []
  const approvals: string[] = []
  const deps: Partial<OpportunityDeps> = {
    clients: [northwind],
    recall: async () => facts,
    listOpportunities: () => {
      const latest = new Map<string, Opportunity>()
      for (const entry of saved) latest.set(entry.id, entry)
      return [...latest.values()]
    },
    save: (entry) => { saved.push(entry) },
    recordGate: (_entry, clause, summary) => { gates.push(`${clause}: ${summary}`) },
    recentNeedMessages: () => needMessages,
    extractNeed: async (entry) => ({ hasNeed: /pipeline|launch/i.test(entry.text), service: 'lead-list', quantity: null, quote: entry.text }),
    markChecked: () => {},
    countFundedAccounts: async () => null,
    post: async (_entry, text) => { posted.push(text); return 'thread-1' },
    requestApproval: (entry) => { approvals.push(entry.id) },
  }
  return { deps, saved, gates, posted, approvals }
}

describe('cadence spotter', () => {
  test('fires once the last delivery is 90 days old and not before', () => {
    expect(spotCadence(northwind, [cadenceFact, icpFact], new Date('2026-09-01T00:00:00Z'))).toBeNull()
    const spotted = spotCadence(northwind, [cadenceFact, icpFact], new Date('2026-10-15T00:00:00Z'))
    expect(spotted?.quantity).toBe(200)
    expect(spotted?.pricePence).toBe(80000)
    expect(spotted?.icp).toBe('fintech CFOs in London')
    expect(spotted?.evidence).toEqual({ kind: 'cadence', facts: [cadenceFact.fact], lastDelivered: '2026-07-14', daysSince: 93 })
  })
})

describe('cadence dedupe', () => {
  test('does not spot the same delivery date again after acceptance or during cooldown', async () => {
    const now = new Date('2026-10-15T00:00:00Z')
    const first = await (async () => {
      const { deps, saved } = harness([cadenceFact, icpFact])
      await runOpportunityTick(now, deps)
      return saved[saved.length - 1]
    })()
    if (!first) throw new Error('expected a spotted opportunity')
    const accepted = { ...first, status: 'accepted' as const, closedAt: now.toISOString() }
    const acceptedRun = harness([cadenceFact, icpFact], [accepted])
    expect(await runOpportunityTick(now, acceptedRun.deps)).toEqual([])
    const declined = { ...first, status: 'declined' as const, closedAt: now.toISOString() }
    const cooldownRun = harness([cadenceFact, icpFact], [declined])
    expect(await runOpportunityTick(new Date('2026-10-18T00:00:00Z'), cooldownRun.deps)).toEqual([])
    const afterCooldown = harness([cadenceFact, icpFact], [declined])
    const outcomes = await runOpportunityTick(new Date('2026-10-23T00:00:00Z'), afterCooldown.deps)
    expect(outcomes.map((entry) => entry.action)).toEqual(['spotted', 'offered'])
  })
})

describe('O2 auto-offer limit', () => {
  test('posts an offer at or under £1,000 and records the gate', async () => {
    const { deps, posted, gates, approvals } = harness([cadenceFact, icpFact])
    const outcomes = await runOpportunityTick(new Date('2026-10-15T00:00:00Z'), deps)
    expect(outcomes.map((entry) => entry.action)).toEqual(['spotted', 'offered'])
    expect(posted[0]).toContain('Offer 200 lead-list at £800.00')
    expect(posted[0]).toContain("Reply 'yes' or 'go ahead' to accept")
    expect(approvals).toEqual([])
    expect(gates.some((entry) => entry.startsWith('O1:'))).toBe(true)
    expect(gates.some((entry) => entry.startsWith('O2:'))).toBe(true)
  })

  test('asks for approval above £1,000 instead of posting', async () => {
    const bigCadence = fact('Orders a fresh list of 400 leads every quarter; last list delivered 2026-07-14')
    const { deps, posted, approvals, saved } = harness([bigCadence, icpFact])
    const outcomes = await runOpportunityTick(new Date('2026-10-15T00:00:00Z'), deps)
    expect(outcomes.map((entry) => entry.action)).toEqual(['spotted', 'approval'])
    expect(posted).toEqual([])
    expect(approvals.length).toBe(1)
    expect(saved[0]?.pricePence).toBe(160000)
    expect(saved[0]?.status).toBe('spotted')
  })
})

describe('O3 one open offer, cooldown, dispute', () => {
  const base: Opportunity = {
    id: 'opp-x', clientName: 'Northwind Capital', service: 'lead-list', quantity: 200, pricePence: 80000, discountNote: '', icp: '',
    rationale: '', evidence: { kind: 'cadence', facts: [], lastDelivered: '2026-07-14', daysSince: 93 }, status: 'offered', clauses: [],
    thread: 'thread-1', spottedAt: '', offeredAt: '', expiresAt: '2026-10-22T00:00:00Z', closedAt: null, acceptanceMessageId: null,
  }
  const now = new Date('2026-10-15T00:00:00Z')
  const candidate: Opportunity = { ...base, id: 'opp-y', status: 'spotted' }

  test('blocks a second open offer for the same client', () => {
    expect(gateO3(candidate, [base], [], now)).toBe('the client already has an open offer')
  })
  test('blocks during the 7-day cooldown after a decline and allows after it', () => {
    const declined: Opportunity = { ...base, status: 'declined', closedAt: '2026-10-12T00:00:00Z' }
    expect(gateO3(candidate, [declined], [], now)).toContain('cooldown')
    expect(gateO3(candidate, [declined], [], new Date('2026-10-20T00:00:00Z'))).toBeNull()
  })
  test('blocks while a dispute is remembered', () => {
    expect(gateO3(candidate, [], [fact('Disputed the September invoice', 'collections')], now)).toBe('a dispute is remembered for this client')
  })
  test('the tick holds the channel opportunity when the cadence offer is already open', async () => {
    const need = message("We're launching the Q4 push next month and the pipeline is thin.")
    const { deps, posted, saved } = harness([cadenceFact, discountFact, icpFact], [], [need])
    const outcomes = await runOpportunityTick(new Date('2026-10-15T00:00:00Z'), deps)
    expect(outcomes.map((entry) => entry.action)).toEqual(['spotted', 'offered', 'spotted', 'gated'])
    expect(posted.length).toBe(1)
    expect(saved.filter((entry) => entry.status === 'offered').length).toBe(1)
    expect(saved.find((entry) => entry.evidence.kind === 'channel')?.evidence).toEqual({ kind: 'channel', quote: need.text, messageId: need.id })
  })
})

describe('O4 acceptance in the same thread', () => {
  const offer: Opportunity = {
    id: 'opp-cadence-1', clientName: 'Northwind Capital', service: 'lead-list', quantity: 200, pricePence: 80000, discountNote: 'standard',
    icp: 'fintech CFOs in London', rationale: 'quarterly refresh', evidence: { kind: 'cadence', facts: [], lastDelivered: '2026-07-14', daysSince: 93 },
    status: 'offered', clauses: ['O1', 'O2', 'O3'], thread: 'thread-1', spottedAt: '', offeredAt: '', expiresAt: '2026-10-22T00:00:00Z', closedAt: null, acceptanceMessageId: null,
  }

  function acceptanceHarness() {
    const saved: Opportunity[] = []
    const billed: BillableIntent[] = []
    const replies: string[] = []
    const processed: string[] = []
    const overrides = {
      listOpportunities: () => [offer],
      extractAcceptance: async (entry: ChannelMessage) => ({ accepts: /\byes\b/i.test(entry.text), declines: /\bnot now\b/i.test(entry.text) }),
      save: (entry: Opportunity) => { saved.push(entry) },
      reply: async (_entry: ChannelMessage, text: string) => { replies.push(text) },
      markProcessed: (id: string) => { processed.push(id) },
      now: () => new Date('2026-10-15T12:00:00Z'),
    }
    const bill = async (_entry: ChannelMessage, intent: BillableIntent) => { billed.push(intent) }
    return { overrides, bill, saved, billed, replies, processed }
  }

  test('converts a yes into a BillableIntent quoting the client', async () => {
    const { overrides, bill, saved, billed, processed } = acceptanceHarness()
    const yes = message('Yes, go ahead with the 200.')
    expect(await handleOfferAcceptance(yes, bill, overrides)).toBe(true)
    expect(saved[0]?.status).toBe('accepted')
    expect(saved[0]?.acceptanceMessageId).toBe(yes.id)
    expect(saved[0]?.clauses).toContain('O4')
    expect(billed[0]).toMatchObject({ isCommitment: true, clientName: 'Northwind Capital', quantity: 200, icp: 'fintech CFOs in London', quote: yes.text })
    expect(processed).toEqual([yes.id])
  })

  test('ignores a yes in another thread', async () => {
    const { overrides, bill, billed } = acceptanceHarness()
    expect(await handleOfferAcceptance(message('yes', 'thread-2'), bill, overrides)).toBe(false)
    expect(billed).toEqual([])
  })

  test('a decline sets the cooldown and bills nothing', async () => {
    const { overrides, bill, saved, billed, replies } = acceptanceHarness()
    expect(await handleOfferAcceptance(message('Not now, thanks.'), bill, overrides)).toBe(true)
    expect(saved[0]?.status).toBe('declined')
    expect(saved[0]?.closedAt).toBe('2026-10-15T12:00:00.000Z')
    expect(billed).toEqual([])
    expect(replies[0]).toContain('7 days')
  })
})
