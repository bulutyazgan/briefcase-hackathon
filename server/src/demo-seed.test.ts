import { describe, expect, test } from 'bun:test'
import { runCollectionsTick } from './features/collections/collections'
import { getSetting, listClients, listInvoices, listOpenInvoices, getState } from './features/ledger/store'
import { recall } from './features/memory/memory'
import { seedLedger } from './demo-seed'

// The demo seed must leave the ledger in the state the six beats assume (TALLY_DB_PATH=:memory:).
describe('demo seed', () => {
  test('resets the ledger, clears the kill switch and seeds the Northwind need plus the Globex invoice', () => {
    const result = seedLedger(new Date('2026-10-15T20:00:00Z'))
    const state = getState()
    expect(state.messages.map((message) => message.author).sort()).toEqual(['Client — Globex', 'Client — Northwind'])
    expect(state.messages.find((message) => message.id === result.northwindNeedId)?.processed_at).toBeNull()
    expect(listInvoices()).toHaveLength(1)
    expect(listOpenInvoices()[0]?.created_at).toBe('2026-10-05 20:00:00')
    expect(listClients()).toHaveLength(0)
    expect(getSetting('control.paused')).toBe('false')
  })

  test('seeds twice to the same state', () => {
    seedLedger()
    seedLedger()
    expect(listInvoices()).toHaveLength(1)
    expect(getState().messages).toHaveLength(2)
  })

  test('the Globex invoice is past due with no remembered dispute, so collections sends one reminder', async () => {
    const now = new Date('2026-10-15T20:00:00Z')
    seedLedger(now)
    const sent: string[] = []
    const outcomes = await runCollectionsTick(now, {
      recall: (clientName) => recall(clientName, 'payment terms, disputes', undefined, { cognee: null }),
      extractSignals: async () => ({ disputes: [], promises: [], model: 'none' }),
      sendReminder: async (_invoice, text) => { sent.push(text) },
    })
    expect(outcomes).toEqual([{ invoiceId: expect.any(String), action: 'reminded', text: expect.stringContaining('Friendly reminder') }])
    expect(sent[0]).toContain('in_seed_globex_q3')
    expect(sent[0]).toContain('7-day terms')
  })
})
