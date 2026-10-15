import { expect, test } from 'bun:test'
import { withFallback } from './fallback-sourcer'
import type { SourcingRequest, SourcingResult } from './sourcing'

const request: SourcingRequest = { orderId: 'm1', icp: 'fintech CFOs', signals: [], quantity: 2, maxTotalCostMicro: 1000 }
const seedResult: SourcingResult = { leads: [], costMicro: 0, calls: [], source: 'seed' }
const tregResult: SourcingResult = {
  leads: [{ id: 't1', name: 'T', company: 'C', url: 'u', provider: 'apollo', costMicro: 5 }],
  costMicro: 5,
  calls: [],
  source: 'treg',
}

test('uses the primary sourcer when it succeeds', async () => {
  const sourcer = withFallback(async () => tregResult, async () => seedResult)
  expect((await sourcer(request)).source).toBe('treg')
})

test('falls back when the primary sourcer throws', async () => {
  const sourcer = withFallback(async () => { throw new Error('TREG_TOKEN missing') }, async () => seedResult)
  expect((await sourcer(request)).source).toBe('seed')
})

test('falls back when the primary buys nothing and keeps its spend on the record', async () => {
  const sourcer = withFallback(async () => ({ ...tregResult, leads: [] }), async () => ({ ...seedResult, leads: [{ id: 's1', name: 'A', company: 'B', url: 'u', provider: 'seed', costMicro: 0 }] }))
  const result = await sourcer(request)
  expect(result.source).toBe('seed')
  expect(result.leads).toHaveLength(1)
  expect(result.costMicro).toBe(5)
})
