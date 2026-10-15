import { beforeEach, describe, expect, test } from 'bun:test'
import { getApproval, getMessage, insertMessage, listEvents, resetLedger, type ChannelMessage } from '../ledger/store'
import { clearSessionFacts, recall, remember } from '../memory/memory'
import { CLIENTS, findClient, type Client } from '../clients/clients'
import type { MemoryFact } from '../policy/decide'
import type { DiscountTerms } from '../pricing/discount'
import { DEFAULT_PLAN, quotePlan, type PlanQuote } from './catalogue'
import {
  decidePlanChange,
  handlePlanChange,
  handlePlanChangeApproval,
  heuristicPlanChange,
  type PlanChange,
  type PlanChangeDeps,
} from './subscriptions'

const northwind = CLIENTS[0] as Client
const NORTHWIND_FACTS: MemoryFact[] = [
  { fact: 'Agreed 10% off orders over 200 leads', date: '2026-08-12' },
  { fact: 'Pays on 7-day terms', date: '2026-08-12' },
]
const NORTHWIND_DISCOUNT: DiscountTerms = { percent: 10, threshold: 200, date: '2026-08-12', fact: 'Agreed 10% off orders over 200 leads' }

function message(id: string, text: string): ChannelMessage {
  return insertMessage({ id, channel: 'web', thread: 'northwind-thread', author: 'Client — Northwind Capital', text, ts: new Date().toISOString(), processed_at: null })
}

function harness(options: { client?: Client; change?: (text: string) => PlanChange } = {}) {
  const subscribed: Array<{ client: Client; quote: PlanQuote; messageId: string }> = []
  const replies: string[] = []
  const deps: PlanChangeDeps = {
    findClient: (author) => options.client ?? findClient(author),
    extract: async (input) => ({ change: options.change?.(input.text) ?? heuristicPlanChange(input), model: 'fake' }),
    recall: async () => NORTHWIND_FACTS,
    discount: async () => ({ terms: NORTHWIND_DISCOUNT, model: 'fake' }),
    gateway: {
      async subscribe(client, quote, messageId) {
        subscribed.push({ client, quote, messageId })
        return { customerId: 'cus_1', productId: 'prod_1', priceId: 'price_1', subscriptionId: `sub_${subscribed.length}`, action: 'created', nextInvoiceDate: '2027-10-15' }
      },
    },
    remember: (clientName, role, fact, source) => remember(clientName, role, fact, source, { cognee: null }),
    reply: async (_message, text) => { replies.push(text) },
  }
  return { deps, subscribed, replies }
}

beforeEach(() => {
  resetLedger()
  clearSessionFacts()
})

describe('plan catalogue math', () => {
  test('Northwind monthly is £400.00 net; the discount threshold is not cleared by 100 leads', () => {
    const quote = quotePlan(DEFAULT_PLAN, 'month', northwind, NORTHWIND_DISCOUNT, NORTHWIND_FACTS)
    expect(quote.unitAmountPence).toBe(40000)
    expect(quote.discountPercent).toBe(0)
    expect(quote.annualValuePence).toBe(480000)
  })

  test('Northwind yearly is £4,320.00 net: 1,200 leads at £4.00 less the remembered 10%', () => {
    const quote = quotePlan(DEFAULT_PLAN, 'year', northwind, NORTHWIND_DISCOUNT, NORTHWIND_FACTS)
    expect(quote.leads).toBe(1200)
    expect(quote.listPence).toBe(480000)
    expect(quote.discountPercent).toBe(10)
    expect(quote.unitAmountPence).toBe(432000)
  })

  test('an undated discount is not applied (P3)', () => {
    const quote = quotePlan(DEFAULT_PLAN, 'year', northwind, { ...NORTHWIND_DISCOUNT, date: '' }, NORTHWIND_FACTS)
    expect(quote.unitAmountPence).toBe(480000)
  })
})

describe('plan changes by conversation (P13)', () => {
  test('a yearly switch applies, replies with the amount and the subscription, remembers and notes staff', async () => {
    const { deps, subscribed, replies } = harness()
    const ask = message('p-1', 'Can we switch to 100 leads a month, billed yearly?')
    expect(await handlePlanChange(ask, deps)).toBe(true)
    expect(subscribed).toHaveLength(1)
    expect(subscribed[0]?.quote).toMatchObject({ interval: 'year', unitAmountPence: 432000 })
    expect(replies[0]).toContain('£4,320.00 net per year')
    expect(replies[0]).toContain('sub_1')
    expect(replies[0]).toContain('Quote: “Can we switch to 100 leads a month, billed yearly?”')
    const events = listEvents('p-1')
    expect(events.find((event) => event.step === 'plan_change')?.policy_clause).toBe('P13')
    const note = events.find((event) => event.step === 'staff_note')
    expect(note?.summary).toContain('Northwind Capital moved from no subscription to 100 leads a month, billed yearly')
    const facts = await recall('Northwind Capital', 'plan', 'billing', { cognee: null })
    expect(facts.some((fact) => fact.sourceMessageId === 'p-1' && fact.fact.includes('billed yearly'))).toBe(true)
    expect(getMessage('p-1')?.processed_at).not.toBeNull()
  })

  test('replaying the same message converges on one subscription call', async () => {
    const { deps, subscribed } = harness()
    const ask = message('p-2', 'Please move us to monthly billing')
    await handlePlanChange(ask, deps)
    await handlePlanChange(ask, deps)
    expect(subscribed).toHaveLength(1)
    expect(subscribed[0]?.quote).toMatchObject({ interval: 'month', unitAmountPence: 40000 })
    expect(listEvents('p-2').filter((event) => event.step === 'plan_change')).toHaveLength(1)
  })

  test('a plan outside the catalogue is refused', async () => {
    const { deps, subscribed, replies } = harness()
    expect(await handlePlanChange(message('p-3', 'Switch us to 250 leads a month, billed yearly'), deps)).toBe(true)
    expect(subscribed).toHaveLength(0)
    expect(replies[0]).toContain('250 leads a month is not in the catalogue (P13)')
  })

  test('above £12,000 a year the account owner approves; approving applies it', async () => {
    const pricey: Client = { ...northwind, pricePerLeadPence: 1200 }
    const { deps, subscribed, replies } = harness({ client: pricey })
    await handlePlanChange(message('p-4', 'Can we switch to 100 leads a month, billed yearly?'), deps)
    expect(subscribed).toHaveLength(0)
    expect(getApproval('p-4')?.status).toBe('pending')
    expect(replies[0]).toContain('Approval required for £12,960.00 a year')

    expect(await handlePlanChangeApproval('p-4', 'approve', deps)).toBe(true)
    expect(subscribed).toHaveLength(1)
    expect(getApproval('p-4')?.status).toBe('approved')
  })

  test('a lead order that mentions a month is not a plan change', async () => {
    const { deps, subscribed } = harness()
    expect(await handlePlanChange(message('p-5', 'Go ahead, order 300 fintech CFO leads this month'), deps)).toBe(false)
    expect(subscribed).toHaveLength(0)
    expect(listEvents('p-5')).toHaveLength(0)
  })

  test('a quote that is not in the message is not acted on', async () => {
    const { deps, subscribed } = harness({ change: () => ({ isPlanChange: true, leadsPerMonth: 100, interval: 'year', quote: 'invented' }) })
    expect(await handlePlanChange(message('p-6', 'Switch us to yearly please'), deps)).toBe(false)
    expect(subscribed).toHaveLength(0)
  })

  test('decidePlanChange only applies a remembered discount', () => {
    const change: PlanChange = { isPlanChange: true, leadsPerMonth: 100, interval: 'year', quote: 'x' }
    const invented: DiscountTerms = { ...NORTHWIND_DISCOUNT, fact: 'Agreed 15% off everything' }
    const decision = decidePlanChange({ client: northwind, change, discount: invented, facts: NORTHWIND_FACTS, previousPlan: 'no subscription' })
    expect(decision.plan?.unitAmountPence).toBe(480000)
  })
})

describe('heuristic plan extraction', () => {
  test('reads the cadence and the billing interval', () => {
    const probe = (text: string): PlanChange => heuristicPlanChange({ ...message('h', 'x'), text })
    expect(probe('Can we switch to 100 leads a month, billed yearly?')).toMatchObject({ isPlanChange: true, leadsPerMonth: 100, interval: 'year' })
    expect(probe('move us to monthly')).toMatchObject({ isPlanChange: true, leadsPerMonth: null, interval: 'month' })
    expect(probe('Go ahead with 300 leads').isPlanChange).toBe(false)
  })
})
