import { beforeEach, describe, expect, test } from 'bun:test'
import {
  getApproval,
  getMessage,
  insertMessage,
  listEvents,
  recordEvent,
  resetLedger,
  saveInvoice,
  type ChannelMessage,
} from '../ledger/store'
import { clearSessionFacts, recall, remember } from '../memory/memory'
import {
  handleCreditNoteApproval,
  handleDispute,
  heuristicDispute,
  type CreditNoteDeps,
  type CreditNoteRequest,
  type DisputeClaim,
} from './credit-notes'

const THREAD = 'globex-thread'

function message(id: string, text: string): ChannelMessage {
  return insertMessage({ id, channel: 'web', thread: THREAD, author: 'Client (Globex)', text, ts: new Date().toISOString(), processed_at: null })
}

function seedInvoice(delivered = 300, totalPence = 120000): void {
  message('order-1', 'Go ahead with 300 leads')
  const leads = Array.from({ length: delivered }, (_, index) => ({
    name: index === 0 ? '' : `Person ${index}`,
    company: `Company ${index}`,
    url: `https://example.com/${index}`,
  }))
  recordEvent({ id: crypto.randomUUID(), message_id: 'order-1', step: 'size', summary: '', data_json: JSON.stringify({ leads }), policy_clause: null })
  recordEvent({ id: crypto.randomUUID(), message_id: 'order-1', step: 'decide', summary: '', data_json: JSON.stringify({ intent: { clientName: 'Globex Partners' } }), policy_clause: null })
  saveInvoice({ id: 'order-1', message_id: 'order-1', stripe_invoice_id: 'in_test_globex', client_id: 'cus_1', total_pence: totalPence, status: 'open', hosted_url: 'https://invoice.stripe.com/x', pdf_path: null })
}

function harness(claim: (text: string) => DisputeClaim) {
  const created: Array<{ request: CreditNoteRequest; key: string }> = []
  const replies: string[] = []
  const deps: CreditNoteDeps = {
    extract: async (input) => ({ claim: claim(input.text), model: 'fake' }),
    issuer: {
      async create(request, key) {
        created.push({ request, key })
        return { id: `cn_${created.length}`, totalPence: request.quantity * request.unitAmountPence }
      },
    },
    remember: (clientName, role, fact, source) => remember(clientName, role, fact, source, { cognee: null }),
    reply: async (_message, text) => { replies.push(text) },
  }
  return { deps, created, replies }
}

const invalid = (count: number) => (text: string): DisputeClaim =>
  ({ isDispute: true, claimedValidCount: null, claimedInvalidCount: count, quote: text })

beforeEach(() => {
  resetLedger()
  clearSessionFacts()
})

describe('disputes become credit notes (P11)', () => {
  test('60 invalid of 300 at £4 is £240 and needs approval; approving issues it', async () => {
    seedInvoice()
    const { deps, created, replies } = harness(invalid(60))
    expect(await handleDispute(message('d-1', '60 of those leads were invalid'), deps)).toBe(true)
    expect(created).toHaveLength(0)
    expect(getApproval('d-1')?.status).toBe('pending')
    expect(replies[0]).toContain('£240.00 needs approval')

    expect(await handleCreditNoteApproval('d-1', 'approve', deps)).toBe(true)
    expect(created).toHaveLength(1)
    expect(created[0]?.request).toMatchObject({ stripeInvoiceId: 'in_test_globex', quantity: 60, unitAmountPence: 400 })
    expect(getApproval('d-1')?.status).toBe('approved')
  })

  test('30 invalid is £120 and is issued automatically with evidence', async () => {
    seedInvoice()
    const { deps, created, replies } = harness(invalid(30))
    await handleDispute(message('d-2', '30 of those leads were invalid'), deps)
    expect(created).toHaveLength(1)
    expect(created[0]?.key).toBe('credit-note-d-2')
    expect(replies[0]).toContain('£120.00')
    expect(replies[0]).toContain('Quote: “30 of those leads were invalid”')
    expect(replies[0]).toContain('300 delivered; 1 failed our row checks')
    expect(listEvents('d-2').find((event) => event.step === 'credit_issued')?.policy_clause).toBe('P11')
    expect(getMessage('d-2')?.processed_at).not.toBeNull()
  })

  test('a claim larger than the delivered count is capped at what was delivered', async () => {
    seedInvoice(40, 16000)
    const { deps, created } = harness(invalid(500))
    await handleDispute(message('d-3', 'All 500 leads were invalid'), deps)
    expect(created[0]?.request.quantity).toBe(40)
    expect(created[0]?.request.unitAmountPence).toBe(400)
  })

  test('a valid-count claim credits the rest ("Only 240 of those leads were valid")', async () => {
    seedInvoice()
    const { deps, created } = harness((text) => heuristicDispute({ ...message('probe', text), text }))
    await handleDispute(message('d-4', 'Only 240 of those leads were valid'), deps)
    expect(created).toHaveLength(0)
    expect(getApproval('d-4')?.reason).toContain('£240.00')
  })

  test('non-dispute messages are ignored', async () => {
    seedInvoice()
    const { deps, created } = harness((text) => ({ isDispute: false, claimedValidCount: null, claimedInvalidCount: null, quote: text }))
    expect(await handleDispute(message('n-1', 'Thanks, the leads look great'), deps)).toBe(false)
    expect(created).toHaveLength(0)
    expect(listEvents('n-1')).toHaveLength(0)
  })

  test('a quote that is not in the message is not acted on', async () => {
    seedInvoice()
    const { deps, created } = harness(() => ({ isDispute: true, claimedValidCount: null, claimedInvalidCount: 30, quote: 'invented' }))
    expect(await handleDispute(message('n-2', 'Some leads were off'), deps)).toBe(false)
    expect(created).toHaveLength(0)
  })

  test('replaying the same dispute issues one credit note', async () => {
    seedInvoice()
    const { deps, created } = harness(invalid(30))
    const dispute = message('d-5', '30 of those leads were invalid')
    await handleDispute(dispute, deps)
    await handleDispute(dispute, deps)
    expect(created).toHaveLength(1)
    expect(listEvents('d-5').filter((event) => event.step === 'credit_issued')).toHaveLength(1)
  })

  test('the dispute is remembered for collections', async () => {
    seedInvoice()
    const { deps } = harness(invalid(30))
    await handleDispute(message('d-6', '30 of those leads were invalid'), deps)
    const facts = await recall('Globex Partners', 'dispute', 'collections', { cognee: null })
    expect(facts.some((fact) => fact.sourceMessageId === 'd-6' && fact.fact.includes('Disputed invoice in_test_globex'))).toBe(true)
  })

  test('no invoice in the thread means the message is not a dispute here', async () => {
    const { deps } = harness(invalid(30))
    expect(await handleDispute(message('d-7', '30 of those leads were invalid'), deps)).toBe(false)
  })
})

describe('heuristic dispute extraction', () => {
  test('reads valid and invalid counts', () => {
    expect(heuristicDispute({ ...message('h-1', 'x'), text: 'Only 240 of those leads were valid' }))
      .toMatchObject({ isDispute: true, claimedValidCount: 240, claimedInvalidCount: null })
    expect(heuristicDispute({ ...message('h-2', 'x'), text: 'We found 60 invalid leads' }))
      .toMatchObject({ isDispute: true, claimedInvalidCount: 60 })
    expect(heuristicDispute({ ...message('h-3', 'x'), text: 'Go ahead with 300 leads' }).isDispute).toBe(false)
  })
})
