import { beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { getEvent, insertMessage, listEvents, recordEvent, resetLedger, saveInvoice, setSetting, type ChannelMessage } from '../ledger/store'
import { clearSessionFacts, remember } from '../memory/memory'
import { handleControlCommand } from '../control/control'
import { handleDispute, type CreditNoteDeps, type DisputeClaim } from '../credit-notes/credit-notes'
import { containsProviderName, listStaffNotes, noteToStaff, redactProviderNames, STAFF_NOTE_STEP } from './staff'
import { staffRoutes } from './routes'

function message(id: string, text: string, author = 'Client — Northwind', thread = 'nw-thread'): ChannelMessage {
  return insertMessage({ id, channel: 'simulator', thread, author, text, ts: new Date().toISOString(), processed_at: null })
}

const VENDOR_NAMES = ['treg', 'cognee', 'firecrawl', 'apollo', 'openai', 'fireworks']

function assertNoVendorNames(text: string): void {
  for (const name of VENDOR_NAMES) expect(text.toLowerCase()).not.toContain(name)
}

beforeEach(() => {
  resetLedger()
  clearSessionFacts()
  setSetting('control.paused', 'false')
  delete process.env.STAFF_SLACK_CHANNEL
  delete process.env.STAFF_TELEGRAM_CHAT_ID
})

describe('staff notes', () => {
  test('an invoice note is recorded as a staff_note event with the billing clauses', async () => {
    message('order-1', 'Go ahead with 200 leads')
    const note = await noteToStaff('order-1', 'invoice', 'Invoiced Northwind Capital £800.00 for 200 leads (invoice in_1), sent to billing+northwind@example.com. No action needed.', ['P1', 'P2', 'P4'])
    const event = getEvent('order-1', STAFF_NOTE_STEP)
    expect(event?.summary).toBe(note.text)
    expect(event?.policy_clause).toBe('P1,P2,P4')
    expect(JSON.parse(event?.data_json ?? '{}')).toEqual({ kind: 'invoice' })
    expect(listStaffNotes()[0]).toMatchObject({ messageId: 'order-1', kind: 'invoice', clauses: ['P1', 'P2', 'P4'] })
  })

  test('an approval note cites the clause that asked for the approval', async () => {
    message('order-2', 'Go ahead with 300 leads')
    await noteToStaff('order-2', 'approval', 'Approval needed from the account owner: £1,200.00 invoice for Northwind Capital. £1,200.00 exceeds the £1,000 auto-send limit.', ['P4'])
    expect(getEvent('order-2', STAFF_NOTE_STEP)?.policy_clause).toBe('P4')
    expect(listStaffNotes()[0]?.kind).toBe('approval')
  })

  test('a plan-change note keeps its kind and the invoice id in the event data', async () => {
    message('plan-1', 'Switch us to yearly', 'Client — Northwind', 'plan-thread')
    await noteToStaff('plan-1', 'plan_change', 'Northwind Capital switched the website care plan from monthly to yearly in chat. Invoice in_plan_1 for £5,000.00 sent to billing+northwind@example.com. No action needed.', ['P8'], { stripeInvoiceId: 'in_plan_1' })
    expect(JSON.parse(getEvent('plan-1', STAFF_NOTE_STEP)?.data_json ?? '{}')).toEqual({ kind: 'plan_change', stripeInvoiceId: 'in_plan_1' })
    expect(listStaffNotes()[0]).toMatchObject({ messageId: 'plan-1', kind: 'plan_change', clauses: ['P8'] })
  })

  test('an issued credit note leaves a P11 staff note naming the client and the amount', async () => {
    message('order-3', 'Go ahead with 100 leads', 'Client — Globex', 'globex-thread')
    const leads = Array.from({ length: 100 }, (_, index) => ({ name: `Person ${index}`, company: `Company ${index}`, url: `https://example.com/${index}` }))
    recordEvent({ id: crypto.randomUUID(), message_id: 'order-3', step: 'size', summary: '', data_json: JSON.stringify({ leads }), policy_clause: null })
    recordEvent({ id: crypto.randomUUID(), message_id: 'order-3', step: 'decide', summary: '', data_json: JSON.stringify({ intent: { clientName: 'Globex Partners' } }), policy_clause: null })
    saveInvoice({ id: 'order-3', message_id: 'order-3', stripe_invoice_id: 'in_globex', client_id: 'cus_1', total_pence: 40000, status: 'open', hosted_url: 'https://invoice.stripe.com/x', pdf_path: null })
    const claim = (text: string): DisputeClaim => ({ isDispute: true, claimedValidCount: null, claimedInvalidCount: 10, quote: text })
    const deps: CreditNoteDeps = {
      extract: async (input) => ({ claim: claim(input.text), model: 'fake' }),
      issuer: { create: async (request) => ({ id: 'cn_1', totalPence: request.quantity * request.unitAmountPence }) },
      remember: (clientName, role, fact, source) => remember(clientName, role, fact, source, { cognee: null }),
      reply: async () => undefined,
    }
    const handled = await handleDispute(message('dispute-3', '10 of those leads were invalid', 'Client — Globex', 'globex-thread'), deps)
    expect(handled).toBe(true)
    const note = listStaffNotes().find((entry) => entry.messageId === 'dispute-3')
    expect(note?.kind).toBe('credit_note')
    expect(note?.clauses).toEqual(['P11'])
    expect(note?.text).toContain('Globex Partners')
    expect(note?.text).toContain('£40.00')
    expect(note?.text).toContain('cn_1')
  })

  test('the kill switch leaves an F1 staff note when it flips either way', async () => {
    await handleControlCommand(message('pause-1', '/pause', 'Bulut'))
    process.env.ACCOUNT_OWNER = 'Bulut'
    await handleControlCommand(message('resume-1', '/resume', 'Bulut'))
    const notes = listStaffNotes()
    expect(notes.map((note) => note.messageId)).toEqual(['resume-1', 'pause-1'])
    for (const note of notes) {
      expect(note.kind).toBe('kill_switch')
      expect(note.clauses).toEqual(['F1'])
    }
    expect(notes[1]?.text).toMatch(/^Paused: Bulut engaged the kill switch/)
    expect(notes[0]?.text).toMatch(/^Resumed: account owner Bulut lifted the kill switch/)
  })

  test('provider names never reach a note, even when a caller includes one', async () => {
    message('order-4', 'Go ahead with 50 leads')
    await noteToStaff('order-4', 'invoice', 'Invoiced Northwind Capital £200.00 for 50 leads bought from Treg and remembered in Cognee.', ['P2'])
    for (const note of listStaffNotes()) assertNoVendorNames(note.text)
    expect(redactProviderNames('Treg, Firecrawl and Apollo')).toBe('our supplier, our supplier and our supplier')
    expect(containsProviderName('Invoiced Northwind Capital £200.00')).toBe(false)
    // The provider-free text still names the client, the amount and the clause.
    expect(listStaffNotes()[0]?.text).toContain('£200.00')
    expect(listStaffNotes()[0]?.clauses).toEqual(['P2'])
  })

  test('GET /api/staff/notes returns notes newest first', async () => {
    message('order-5', 'Go ahead with 100 leads')
    await noteToStaff('order-5', 'approval', 'Approval needed from the account owner: £400.00 invoice for Initech. First invoice for a new client.', ['P12'])
    await Bun.sleep(5)
    await noteToStaff('order-5', 'invoice', 'Invoiced Initech £400.00 for 100 leads (invoice in_5), sent to ap@initech.example. No action needed.', ['P2', 'P12'])
    await Bun.sleep(5)
    await noteToStaff('order-5', 'payment', 'Payment received: Initech paid £400.00 on invoice in_5; the lead list was delivered. No action needed.', ['P2', 'P6'])
    const app = new Hono().route('/api/staff', staffRoutes)
    const response = await app.request('/api/staff/notes')
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    const notes = body && typeof body === 'object' && 'notes' in body && Array.isArray(body.notes) ? body.notes : []
    expect(notes.map((note) => (note && typeof note === 'object' && 'kind' in note ? note.kind : null))).toEqual(['payment', 'invoice', 'approval'])
    const timestamps = notes.map((note) => (note && typeof note === 'object' && 'createdAt' in note && typeof note.createdAt === 'string' ? note.createdAt : ''))
    expect([...timestamps].sort().reverse()).toEqual(timestamps)
    expect(listEvents('order-5').filter((event) => event.step === STAFF_NOTE_STEP)).toHaveLength(3)
  })
})
