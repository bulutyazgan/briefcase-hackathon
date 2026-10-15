import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { runCollectionsTick } from './features/collections/collections'
import { getEvent, getSetting, listClients, listInvoices, listOpenInvoices, getState } from './features/ledger/store'
import { recall } from './features/memory/memory'
import { seedGlobexInvoice, seedLedger } from './demo-seed'

// The demo seed must leave the ledger in the state the six beats assume (TALLY_DB_PATH=:memory:).
// Without a Stripe key the invoice takes the placeholder path; the Stripe path is proven live by
// scripts/verify-demo-seed.ts.
const NOW = new Date('2026-10-15T20:00:00Z')

async function seedAll(): Promise<{ northwindNeedId: string; globexOrderId: string }> {
  const ledger = seedLedger(NOW)
  await seedGlobexInvoice(ledger.globexOrderId, ledger.orderedAt)
  return ledger
}

describe('demo seed', () => {
  // No Stripe or Fireworks in tests: the placeholder invoice path and the regex signal fallback.
  let stripeKey: string | undefined
  let fireworksKey: string | undefined
  beforeEach(() => {
    stripeKey = process.env.STRIPE_SECRET_KEY
    fireworksKey = process.env.FIREWORKS_API_KEY
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.FIREWORKS_API_KEY
  })
  afterEach(() => {
    if (stripeKey !== undefined) process.env.STRIPE_SECRET_KEY = stripeKey
    if (fireworksKey !== undefined) process.env.FIREWORKS_API_KEY = fireworksKey
  })

  test('resets the ledger, clears the kill switch and seeds the Northwind need plus the Globex invoice', async () => {
    const result = await seedAll()
    const state = getState()
    expect(state.messages.map((message) => message.author).sort()).toEqual(['Client — Globex', 'Client — Northwind'])
    expect(state.messages.find((message) => message.id === result.northwindNeedId)?.processed_at).toBeNull()
    // The Globex order is history: the agent loop must not source or bill it again.
    expect(state.messages.find((message) => message.id === result.globexOrderId)?.processed_at).toBe('2026-10-05T20:00:00.000Z')
    const invoice = listOpenInvoices()[0]
    expect(listInvoices()).toHaveLength(1)
    expect(invoice?.total_pence).toBe(20000)
    expect(invoice?.created_at).toBe('2026-10-05 20:00:00')
    expect(getEvent(result.globexOrderId, 'size')).not.toBeNull()
    expect(listClients()).toHaveLength(0)
    expect(getSetting('control.paused')).toBe('false')
  })

  test('seeds twice to the same state', async () => {
    await seedAll()
    await seedAll()
    expect(listInvoices()).toHaveLength(1)
    expect(getState().messages).toHaveLength(2)
  })

  test('the Globex invoice is past due with no remembered dispute, so collections sends one reminder', async () => {
    await seedAll()
    const sent: string[] = []
    // The real extractor on its regex fallback: the seeded facts must not read as a dispute to it.
    const outcomes = await runCollectionsTick(NOW, {
      recall: (clientName) => recall(clientName, 'payment terms, disputes', undefined, { cognee: null }),
      sendReminder: async (_invoice, text) => { sent.push(text) },
    })
    expect(outcomes).toEqual([{ invoiceId: expect.any(String), action: 'reminded', text: expect.stringContaining('Friendly reminder') }])
    expect(sent[0]).toContain('in_seed_globex_q3')
    expect(sent[0]).toContain('7-day terms')
  })
})
