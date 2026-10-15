import { describe, expect, test } from 'bun:test'
import { insertMessage, listEventsByStep, listThreadMessages, resetLedger, saveInvoice } from '../ledger/store'
import { runBuyerTick, startBuyerOrder } from './buyer'
import {
  BUYER_AGENT_AUTHOR,
  DEFAULT_ORDER,
  evaluateCounterOffer,
  evaluateInvoice,
  extractPoNumber,
  parseCounterOffer,
  type BuyerInvoice,
} from './policy'
import type { BuyerPayments } from './providers/stripe-payments'

const northwindInvoice: BuyerInvoice = {
  id: 'in_test_northwind',
  customerId: 'cus_northwind',
  status: 'open',
  totalPence: 108000,
  lines: [{ netPence: 108000, leads: 300 }],
  poNumber: 'PO-2026-104',
}

function fakeStripe(invoice: BuyerInvoice): BuyerPayments & { payments: string[] } {
  let status = invoice.status
  const payments: string[] = []
  return {
    payments,
    async retrieveInvoice() {
      return { ...invoice, status }
    },
    async payInvoice(target) {
      if (status !== 'paid') payments.push(target.id)
      status = 'paid'
      return { status }
    },
  }
}

function tallyReply(thread: string, text: string): void {
  const now = new Date().toISOString()
  insertMessage({ id: crypto.randomUUID(), channel: 'simulator', thread, author: 'tally', text, ts: now, processed_at: now })
}

describe('buyer policy', () => {
  test('B1 rejects the £800 upsell on top of the £1,080 order', () => {
    const offer = parseCounterOffer('Add 200 more leads for £800?')
    expect(offer).toEqual({ leads: 200, pricePence: 80000 })
    const verdict = offer ? evaluateCounterOffer(offer, 0, 108000) : null
    expect(verdict).toMatchObject({ ok: false, clause: 'B1' })
  })

  test('B2 rejects more than £5 per lead net', () => {
    const verdict = evaluateInvoice({ ...northwindInvoice, totalPence: 60000, lines: [{ netPence: 60000, leads: 100 }] }, 'PO-2026-104', 0)
    expect(verdict).toMatchObject({ ok: false, clause: 'B2' })
  })

  test('B3 rejects an invoice without the order PO', () => {
    expect(evaluateInvoice({ ...northwindInvoice, poNumber: null }, 'PO-2026-104', 0)).toMatchObject({ ok: false, clause: 'B3' })
    expect(extractPoNumber("Let's kick off Q4. 300 fintech CFO leads.")).toBeNull()
    expect(() => startBuyerOrder("Let's kick off Q4. 300 fintech CFO leads.")).toThrow('B3')
  })

  test('B1 counts what the buyer already paid this month', () => {
    expect(evaluateInvoice(northwindInvoice, 'PO-2026-104', 50000)).toMatchObject({ ok: false, clause: 'B1' })
  })
})

describe('buyer agent', () => {
  test('rejects the upsell, then pays Northwind £1,080 with its PO exactly once', async () => {
    resetLedger()
    const order = startBuyerOrder()
    expect(order.author).toBe(BUYER_AGENT_AUTHOR)
    expect(order.processed_at).toBeNull()
    saveInvoice({
      id: order.id,
      message_id: order.id,
      stripe_invoice_id: northwindInvoice.id,
      client_id: northwindInvoice.customerId,
      total_pence: 108000,
      status: 'open',
      hosted_url: 'https://invoice.stripe.com/test',
      pdf_path: null,
    })
    tallyReply(order.thread, 'Add 200 more leads for £800?')
    const stripe = fakeStripe(northwindInvoice)

    await runBuyerTick(stripe)
    const afterReject = listThreadMessages(order.thread).filter((message) => message.author === BUYER_AGENT_AUTHOR)
    expect(afterReject.at(-1)?.text).toStartWith('Declined under B1.')
    expect(listEventsByStep('buyer_reject')[0]?.policy_clause).toBe('B1')
    expect(stripe.payments).toEqual([])

    await runBuyerTick(stripe)
    await runBuyerTick(stripe)
    expect(stripe.payments).toEqual([northwindInvoice.id])
    const paid = listEventsByStep('buyer_pay')
    expect(paid).toHaveLength(1)
    expect(paid[0]?.policy_clause).toBe('B1,B2,B3')
    const lastPost = listThreadMessages(order.thread).filter((message) => message.author === BUYER_AGENT_AUTHOR).at(-1)
    expect(lastPost?.text).toBe(`Paid under B1–B3: ${northwindInvoice.id}, £1,080 on ${DEFAULT_ORDER.poNumber}.`)
  })

  test('refuses an invoice whose PO does not match and never pays it', async () => {
    resetLedger()
    const order = startBuyerOrder()
    saveInvoice({
      id: order.id,
      message_id: order.id,
      stripe_invoice_id: 'in_no_po',
      client_id: 'cus_northwind',
      total_pence: 108000,
      status: 'open',
      hosted_url: null,
      pdf_path: null,
    })
    const stripe = fakeStripe({ ...northwindInvoice, id: 'in_no_po', poNumber: null })
    await runBuyerTick(stripe)
    await runBuyerTick(stripe)
    expect(stripe.payments).toEqual([])
    expect(listEventsByStep('buyer_reject').map((event) => event.policy_clause)).toEqual(['B3'])
  })
})
