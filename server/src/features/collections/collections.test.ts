import { describe, expect, test } from 'bun:test'
import type { EventRow, InvoiceRow } from '../ledger/store'
import type { RoleFact } from '../memory/memory'
import { runCollectionsTick, SKIP_STEP, REMINDER_STEP, type CollectionsDeps, type LastEvent } from './collections'
import { regexSignals, resolvePromisedDate } from './signals'

const invoice: InvoiceRow = {
  id: 'inv-1',
  message_id: 'msg-1',
  stripe_invoice_id: 'in_test_1',
  client_id: 'cus_1',
  total_pence: 108000,
  status: 'open',
  hosted_url: 'https://invoice.stripe.com/test',
  pdf_path: null,
  created_at: '2026-10-01 09:00:00',
}

function fact(text: string, role: RoleFact['role'], date = '2026-08-12'): RoleFact {
  return { clientName: 'Northwind Capital', fact: text, role, date, sourceMessageId: `src-${text.length}` }
}

function harness(facts: RoleFact[]) {
  const events: Omit<EventRow, 'created_at'>[] = []
  const sent: string[] = []
  const deps: Partial<CollectionsDeps> = {
    listOpenInvoices: () => [invoice],
    clientNameFor: () => 'Northwind Capital',
    recall: async () => facts,
    extractSignals: async (input) => regexSignals(input),
    lastEvent(_invoice, step): LastEvent | null {
      const event = [...events].reverse().find((entry) => entry.step === step)
      if (!event) return null
      const data: unknown = JSON.parse(event.data_json)
      if (typeof data !== 'object' || data === null || !('at' in data) || typeof data.at !== 'string') return null
      const reason = 'reason' in data && typeof data.reason === 'string' ? data.reason : ''
      return { at: new Date(data.at), reason }
    },
    recordEvent: (event) => { events.push(event) },
    sendReminder: async (_invoice, text) => { sent.push(text) },
  }
  return { deps, events, sent }
}

const terms = [fact('Pays on 7-day terms', 'billing'), fact('Agreed 10% off orders over 200 leads', 'sales')]

describe('collections tick (P7)', () => {
  test('does nothing before the due date', async () => {
    const { deps, sent, events } = harness(terms)
    const result = await runCollectionsTick(new Date('2026-10-05T09:00:00Z'), deps)
    expect(result[0]?.action).toBe('not_due')
    expect(sent).toHaveLength(0)
    expect(events).toHaveLength(0)
  })

  test('sends at most one reminder per 24 h, citing the agreement', async () => {
    const { deps, sent, events } = harness(terms)
    await runCollectionsTick(new Date('2026-10-09T10:00:00Z'), deps)
    await runCollectionsTick(new Date('2026-10-09T20:00:00Z'), deps)
    await runCollectionsTick(new Date('2026-10-10T09:59:00Z'), deps)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('Pays on 7-day terms')
    expect(sent[0]).toContain('Agreed 10% off')
    expect(events.filter((entry) => entry.step === REMINDER_STEP)).toHaveLength(1)
    expect(events[0]?.policy_clause).toBe('P7')
    await runCollectionsTick(new Date('2026-10-10T10:00:00Z'), deps)
    expect(sent).toHaveLength(2)
  })

  test('never reminds a client with a remembered dispute', async () => {
    const { deps, sent, events } = harness([
      ...terms,
      fact('Disputed the September invoice: says 60 of the leads were invalid', 'collections', '2026-09-20'),
    ])
    const result = await runCollectionsTick(new Date('2026-10-12T10:00:00Z'), deps)
    await runCollectionsTick(new Date('2026-10-12T10:00:10Z'), deps)
    expect(result[0]).toEqual({ invoiceId: 'inv-1', action: 'skipped', reason: 'dispute' })
    expect(sent).toHaveLength(0)
    expect(events.filter((entry) => entry.step === SKIP_STEP)).toHaveLength(1)
    expect(events[0]?.policy_clause).toBe('P7')
  })

  test('does not chase before a promised payment date, then chases after it', async () => {
    // 2026-10-13 is a Tuesday, so "Friday" resolves to 2026-10-16.
    const { deps, sent } = harness([...terms, fact("We'll pay Friday", 'collections', '2026-10-13')])
    const before = await runCollectionsTick(new Date('2026-10-14T10:00:00Z'), deps)
    expect(before[0]).toEqual({ invoiceId: 'inv-1', action: 'skipped', reason: 'promise:2026-10-16' })
    expect(sent).toHaveLength(0)
    const after = await runCollectionsTick(new Date('2026-10-17T10:00:00Z'), deps)
    expect(after[0]?.action).toBe('reminded')
    expect(sent).toHaveLength(1)
  })

  test('resolves promised dates', () => {
    expect(resolvePromisedDate("we'll pay Friday", '2026-10-13')).toBe('2026-10-16')
    expect(resolvePromisedDate('will pay on 2026-11-01', '2026-10-13')).toBe('2026-11-01')
    expect(resolvePromisedDate('will pay tomorrow', '2026-10-13')).toBe('2026-10-14')
  })
})
