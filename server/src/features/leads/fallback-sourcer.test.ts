import { expect, test } from 'bun:test'
import { withFallback } from './fallback-sourcer'
import type { SourcingRequest, SourcingResult } from './sourcing'

const request: SourcingRequest = { orderId: 'm1', icp: 'fintech CFOs', signals: [], quantity: 2, maxTotalCostMicro: 1000 }
const seedResult: SourcingResult = { leads: [], costMicro: 0, calls: [], source: 'seed' }
const tregResult: SourcingResult = { leads: [], costMicro: 5, calls: [], source: 'treg' }

test('uses the primary sourcer when it succeeds', async () => {
  const sourcer = withFallback(async () => tregResult, async () => seedResult)
  expect((await sourcer(request)).source).toBe('treg')
})

test('falls back when the primary sourcer throws', async () => {
  const sourcer = withFallback(async () => { throw new Error('TREG_TOKEN missing') }, async () => seedResult)
  expect((await sourcer(request)).source).toBe('seed')
})
