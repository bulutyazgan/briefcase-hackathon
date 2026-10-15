import { describe, expect, test } from 'bun:test'
import type { SourcedLead, Sourcer } from '../leads/sourcing'
import { decide, type BillableIntent, type MemoryFact } from '../policy/decide'
import { regexDiscountTerms, validateDiscount } from './discount'
import { settleOrder } from './order'
import { checkMargin, penceToMicroUsd, sourcingCapMicro } from './pricing'

function intentFor(clientName: string, quantity: number): BillableIntent {
  return {
    isCommitment: true,
    clientName,
    ask: `${quantity} fintech CFO leads`,
    icp: 'fintech CFOs in London',
    signals: [],
    quantity,
    quote: `${quantity} fintech CFO leads`,
  }
}

const northwindFacts: MemoryFact[] = [
  { fact: 'Agreed 10% off orders over 200 leads', date: '2026-08-12' },
  { fact: 'Pays on 7-day terms', date: '2026-08-12' },
]

function fakeSourcer(count: number, costMicroPerLead: number): Sourcer {
  return async (request) => {
    const leads: SourcedLead[] = Array.from({ length: count }, (_, index) => ({
      id: `lead-${index}`,
      name: `Person ${index}`,
      company: `Company ${index}`,
      url: `https://example.com/${index}`,
      provider: 'fake',
      costMicro: costMicroPerLead,
    }))
    return {
      leads,
      costMicro: Math.min(count * costMicroPerLead, request.maxTotalCostMicro),
      calls: [],
      source: 'seed',
    }
  }
}

describe('pricing and decide', () => {
  test('Northwind 300 leads → £1,080 after the remembered 10% discount, needs approval (P4)', () => {
    const decision = decide(intentFor('Northwind Capital', 300), northwindFacts, 300)
    expect(decision.totalPence).toBe(108000)
    expect(decision.lines[0]?.unitPricePence).toBe(400)
    expect(decision.outcome).toBe('needs_approval')
    expect(decision.clauses).toContain('P3')
  })

  test('Acme 100 leads → £500, auto-sent', () => {
    const decision = decide(intentFor('Acme Ventures', 100), [], 100)
    expect(decision.totalPence).toBe(50000)
    expect(decision.outcome).toBe('auto')
  })

  test('discount is capped at 15% (P3)', () => {
    const facts = [{ fact: 'Agreed 30% off orders over 50 leads', date: '2026-07-01' }]
    expect(validateDiscount(regexDiscountTerms(facts), 100, facts).percent).toBe(15)
    expect(decide(intentFor('Acme Ventures', 100), facts, 100).totalPence).toBe(42500)
  })

  test('undated discount is rejected (P3)', () => {
    const facts = [{ fact: 'Agreed 10% off orders over 200 leads', date: '' }]
    expect(validateDiscount(regexDiscountTerms(facts), 300, facts).percent).toBe(0)
    expect(decide(intentFor('Northwind Capital', 300), facts, 300).totalPence).toBe(120000)
  })

  test('discount not in recalled facts is rejected', () => {
    const terms = { percent: 10, threshold: 0, date: '2026-01-01', fact: 'Invented by the model' }
    expect(validateDiscount(terms, 300, northwindFacts).percent).toBe(0)
  })

  test('unknown client is refused (P5)', () => {
    const decision = decide(intentFor('Initech', 100), [], 100)
    expect(decision.outcome).toBe('refuse')
    expect(decision.clauses).toContain('P5')
  })
})

describe('margin and sourcing', () => {
  test('sourcing cap is 60% of invoice net in micro-USD (P9)', () => {
    expect(sourcingCapMicro(108000)).toBe(Math.floor(penceToMicroUsd(64800)))
  })

  test('P8 passes at ≥ 40% margin and fails below', () => {
    // £100 invoice; cost $50 = 3950p → margin 60.5%
    expect(checkMargin(10000, 50_000_000).ok).toBe(true)
    // cost $100 = 7900p → margin 21%
    expect(checkMargin(10000, 100_000_000).ok).toBe(false)
  })

  test('margin failure turns the settled order into needs_approval (P8)', async () => {
    const intent = intentFor('Acme Ventures', 100)
    const sourcing = await fakeSourcer(100, 4_000_000)({
      orderId: 'o', icp: intent.icp, signals: [], quantity: 100, maxTotalCostMicro: Number.MAX_SAFE_INTEGER,
    })
    const settled = settleOrder(intent, [], null, 100, sourcing)
    expect(settled.margin.ok).toBe(false)
    expect(settled.decision.outcome).toBe('needs_approval')
    expect(settled.decision.clauses).toContain('P8')
  })

  test('bills exactly the leads bought when fewer than requested', async () => {
    const intent = intentFor('Northwind Capital', 300)
    const sourcing = await fakeSourcer(250, 0)({
      orderId: 'o', icp: intent.icp, signals: [], quantity: 300, maxTotalCostMicro: sourcingCapMicro(108000),
    })
    const settled = settleOrder(intent, northwindFacts, regexDiscountTerms(northwindFacts), 300, sourcing)
    expect(settled.leads.length).toBe(250)
    expect(settled.decision.lines[0]?.quantity).toBe(250)
    expect(settled.decision.totalPence).toBe(90000)
    expect(settled.decision.outcome).toBe('auto')
  })

  test('never bills more than requested', async () => {
    const intent = intentFor('Acme Ventures', 100)
    const sourcing = await fakeSourcer(140, 0)({
      orderId: 'o', icp: intent.icp, signals: [], quantity: 100, maxTotalCostMicro: 1,
    })
    const settled = settleOrder(intent, [], null, 100, sourcing)
    expect(settled.leads.length).toBe(100)
    expect(settled.decision.totalPence).toBe(50000)
  })

  test('zero leads bought is refused, nothing billed', async () => {
    const intent = intentFor('Acme Ventures', 100)
    const sourcing = await fakeSourcer(0, 0)({
      orderId: 'o', icp: intent.icp, signals: [], quantity: 100, maxTotalCostMicro: 1,
    })
    expect(settleOrder(intent, [], null, 100, sourcing).decision.outcome).toBe('refuse')
  })

  test('invoice line text never mentions providers', () => {
    const decision = decide(intentFor('Acme Ventures', 100), [], 100)
    expect(decision.lines[0]?.description).not.toMatch(/treg|firecrawl|provider/i)
  })
})
