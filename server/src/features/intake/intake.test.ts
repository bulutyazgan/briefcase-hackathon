import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { findClient } from '../clients/clients'
import { getEvent, insertMessage, listClients, listEvents, listInvoices, resetLedger, type ChannelMessage } from '../ledger/store'
import { clearSessionFacts, recall, remember } from '../memory/memory'
import { recallCompanyFacts } from '../memory/company'
import { decide, type BillableIntent } from '../policy/decide'
import {
  CLIENT_IDENTIFIED_STEP,
  COMPANY_LEARNED_STEP,
  INTAKE_STEP,
  ONBOARD_STEP,
  gateFirstInvoice,
  handleIntake,
  heuristicInquiry,
  identifyClient,
  onboardClient,
  type IntakeDeps,
} from './intake'

const THREAD = 'initech-thread'
const INQUIRY = "Hi, we're Initech. What do you charge for lead lists? We'd need around 300 fintech CFO leads in London."
const COMMITMENT = "Let's go ahead with 300 leads. Fintech CFOs in London. Send invoices to ap@initech.example."

function message(id: string, text: string, author = 'Client — Initech', thread = THREAD): ChannelMessage {
  return insertMessage({ id, channel: 'simulator', thread, author, text, ts: new Date().toISOString(), processed_at: null })
}

function harness() {
  const replies: string[] = []
  const deps: Partial<IntakeDeps> = {
    extract: async (input) => ({ inquiry: heuristicInquiry(input), model: 'fake' }),
    recallCompany: (query) => recallCompanyFacts(query, { cognee: null }),
    remember: (clientName, role, fact, source) => remember(clientName, role, fact, source, { cognee: null }),
    reply: async (_message, text) => { replies.push(text) },
  }
  return { deps, replies }
}

function commitment(quantity: number, text = COMMITMENT): BillableIntent {
  return { isCommitment: true, clientName: 'Initech', ask: text, icp: 'fintech CFOs in London', signals: [], quantity, quote: text }
}

beforeEach(() => resetLedger())
afterEach(() => clearSessionFacts())

describe('intake (P12)', () => {
  test('answers an unknown sender from the company knowledge base with the price and one clarifying question, no Stripe', async () => {
    const { deps, replies } = harness()
    const handled = await handleIntake(message('inq-1', INQUIRY), deps)
    expect(handled).toBe(true)
    expect(replies).toHaveLength(1)
    const text = replies[0] ?? ''
    expect(text).toContain('£4 per lead')
    expect(text).toContain('Minimum order is 100 leads')
    expect(text).toContain('£1200.00')
    expect(text.trim().endsWith('?')).toBe(true)
    expect(getEvent('inq-1', COMPANY_LEARNED_STEP)?.policy_clause).toBe('P12')
    expect(getEvent('inq-1', INTAKE_STEP)?.policy_clause).toBe('P12')
    expect(listInvoices()).toHaveLength(0)
    expect(listClients()).toHaveLength(0)
    expect(findClient('Client — Initech')).toBeNull()
  })

  test('a commitment after the inquiry onboards the client at the standard price and its first invoice needs approval even at £400', async () => {
    const { deps } = harness()
    await handleIntake(message('inq-2', INQUIRY), deps)
    const client = await onboardClient(message('commit-2', COMMITMENT), commitment(100), deps)
    expect(client?.name).toBe('Initech')
    expect(client?.source).toBe('intake')
    expect(client?.pricePerLeadPence).toBe(400)
    expect(client?.billingEmail).toBe('ap@initech.example')
    expect(findClient('Client — Initech')?.name).toBe('Initech')
    expect(getEvent('commit-2', ONBOARD_STEP)?.policy_clause).toBe('P12')
    const sales = await recall('Initech', 'onboarded', 'sales', { cognee: null })
    expect(sales.some((fact) => /standard price list/.test(fact.fact))).toBe(true)

    const intent = { ...commitment(100), clientName: client?.name ?? '' }
    const decision = gateFirstInvoice(client, decide(intent, [], 100, null))
    expect(decision.totalPence).toBe(40000)
    expect(decision.outcome).toBe('needs_approval')
    expect(decision.clauses).toContain('P12')
    expect(decision.reason).toMatch(/first invoice for new client Initech/)
  })

  test('a cold commitment with no inquiry in the thread stays unknown (P5)', async () => {
    const { deps } = harness()
    const client = await onboardClient(message('cold-1', COMMITMENT, 'Client — Initech Unknown', 'cold-thread'), commitment(300), deps)
    expect(client).toBeNull()
    expect(listClients()).toHaveLength(0)
    expect(decide(commitment(300), [], 300, null).outcome).toBe('refuse')
  })

  test('existing clients are unaffected', async () => {
    const { deps, replies } = harness()
    const handled = await handleIntake(message('nw-1', 'What do you charge for 100 leads?', 'Client — Northwind', 'northwind-thread'), deps)
    expect(handled).toBe(false)
    expect(replies).toHaveLength(0)
    const northwind = findClient('Client — Northwind')
    expect(northwind?.pricePerLeadPence).toBe(400)
    const intent: BillableIntent = { ...commitment(100, 'Go ahead with 100 leads'), clientName: 'Northwind Capital' }
    const decision = decide(intent, [], 100, null)
    expect(gateFirstInvoice(northwind, decision)).toEqual(decision)
    expect(decision.outcome).toBe('auto')
  })

  test('replaying the commitment creates one client and one onboard note', async () => {
    const { deps } = harness()
    await handleIntake(message('inq-3', INQUIRY), deps)
    const first = await onboardClient(message('commit-3', COMMITMENT), commitment(300), deps)
    const again = await onboardClient(message('commit-3', COMMITMENT), commitment(300), deps)
    expect(first?.name).toBe('Initech')
    expect(again?.name).toBe('Initech')
    expect(listClients()).toHaveLength(1)
    expect(listEvents('commit-3').filter((event) => event.step === ONBOARD_STEP)).toHaveLength(1)
  })

  test('identifyClient records client_identified once per thread', () => {
    const first = identifyClient(message('id-1', 'Hello', 'Client — Northwind', 'id-thread'), 'Northwind Capital')
    const second = identifyClient(message('id-2', 'Again', 'Client — Northwind', 'id-thread'), 'Northwind Capital')
    expect(first?.name).toBe('Northwind Capital')
    expect(second?.name).toBe('Northwind Capital')
    expect(getEvent('id-1', CLIENT_IDENTIFIED_STEP)?.summary).toMatch(/Northwind Capital/)
    expect(getEvent('id-2', CLIENT_IDENTIFIED_STEP)).toBeNull()
    expect(identifyClient(message('id-3', 'Hi', 'Client — Nobody', 'other-thread'), 'Nobody')).toBeNull()
  })
})
