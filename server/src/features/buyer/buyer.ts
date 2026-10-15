import { z } from 'zod'
import {
  getEvent,
  getLatestInvoiceForThread,
  insertMessage,
  listEvents,
  listEventsByStep,
  listThreadMessages,
  recordEvent,
  type ChannelMessage,
} from '../ledger/store'
import {
  BUYER_AGENT_AUTHOR,
  DEFAULT_ORDER,
  evaluateCounterOffer,
  evaluateInvoice,
  extractPoNumber,
  money,
  parseCounterOffer,
  type BuyerClause,
} from './policy'
import type { BuyerPayments } from './providers/stripe-payments'

const orderSchema = z.object({ thread: z.string(), poNumber: z.string() })
const paymentSchema = z.object({ totalPence: z.number() })
const rejectSchema = z.object({ target: z.enum(['counter_offer', 'invoice']) })

function record(messageId: string, step: string, summary: string, data: unknown, clauses: BuyerClause[]): void {
  recordEvent({
    id: crypto.randomUUID(),
    message_id: messageId,
    step,
    summary,
    data_json: JSON.stringify(data),
    policy_clause: clauses.join(','),
  })
}

// The buyer's own replies are posted already processed, so Tally never treats them as orders.
function post(thread: string, text: string, processed: boolean): ChannelMessage {
  const now = new Date().toISOString()
  return insertMessage({
    id: crypto.randomUUID(),
    channel: 'simulator',
    thread,
    author: BUYER_AGENT_AUTHOR,
    text,
    ts: now,
    processed_at: processed ? now : null,
  })
}

export function startBuyerOrder(text: string = DEFAULT_ORDER.text): ChannelMessage {
  const poNumber = extractPoNumber(text)
  if (!poNumber) throw new Error('B3: every order needs a PO number.')
  const id = crypto.randomUUID()
  const order = post(id, text, false)
  record(order.id, 'buyer_order', `Procurement agent ordered under ${poNumber}.`, { thread: order.thread, poNumber, text }, ['B3'])
  return order
}

export function buyerSpentThisMonth(now: Date): number {
  const month = now.toISOString().slice(0, 7)
  return listEventsByStep('buyer_pay')
    .filter((event) => event.created_at.slice(0, 7) === month)
    .reduce((sum, event) => {
      const parsed = paymentSchema.safeParse(JSON.parse(event.data_json))
      return sum + (parsed.success ? parsed.data.totalPence : 0)
    }, 0)
}

function rejected(orderId: string, target: 'counter_offer' | 'invoice'): boolean {
  return listEvents(orderId).some((event) => {
    if (event.step !== 'buyer_reject') return false
    const parsed = rejectSchema.safeParse(JSON.parse(event.data_json))
    return parsed.success && parsed.data.target === target
  })
}

// One action per order per tick, so the reject and the payment land as separate beats in the thread.
async function advanceOrder(orderId: string, thread: string, poNumber: string, payments: BuyerPayments, now: Date): Promise<void> {
  if (getEvent(orderId, 'buyer_pay')) return
  const spent = buyerSpentThisMonth(now)
  const invoiceRow = getLatestInvoiceForThread(thread)

  const offerMessage = listThreadMessages(thread).find((message) => message.author === 'tally' && parseCounterOffer(message.text))
  const offer = offerMessage ? parseCounterOffer(offerMessage.text) : null
  if (offer && !rejected(orderId, 'counter_offer')) {
    const verdict = evaluateCounterOffer(offer, spent, invoiceRow?.total_pence ?? 0)
    if (!verdict.ok) {
      post(thread, `Declined under ${verdict.clause}. ${verdict.reason}`, true)
      record(orderId, 'buyer_reject', `Declined the counter-offer under ${verdict.clause}.`, { target: 'counter_offer', offer, reason: verdict.reason }, [verdict.clause])
      return
    }
  }

  if (!invoiceRow?.stripe_invoice_id || rejected(orderId, 'invoice')) return
  const invoice = await payments.retrieveInvoice(invoiceRow.stripe_invoice_id)
  if (invoice.status === 'paid') {
    record(orderId, 'buyer_pay', `Invoice ${invoice.id} was already paid.`, { stripeInvoiceId: invoice.id, totalPence: invoice.totalPence, alreadyPaid: true }, ['B1', 'B2', 'B3'])
    return
  }
  if (invoice.status !== 'open') return
  const verdict = evaluateInvoice(invoice, poNumber, spent)
  if (!verdict.ok) {
    post(thread, `Not paying ${invoice.id} under ${verdict.clause}. ${verdict.reason}`, true)
    record(orderId, 'buyer_reject', `Refused invoice ${invoice.id} under ${verdict.clause}.`, { target: 'invoice', stripeInvoiceId: invoice.id, reason: verdict.reason }, [verdict.clause])
    return
  }
  const result = await payments.payInvoice(invoice)
  record(orderId, 'buyer_pay', `Paid ${invoice.id} for ${money(invoice.totalPence)} under B1–B3.`, {
    stripeInvoiceId: invoice.id,
    totalPence: invoice.totalPence,
    poNumber,
    status: result.status,
    paymentMethod: 'pm_card_visa',
  }, verdict.clauses)
  post(thread, `Paid under B1–B3: ${invoice.id}, ${money(invoice.totalPence)} on ${poNumber}.`, true)
}

export async function runBuyerTick(payments: BuyerPayments, now: Date = new Date()): Promise<void> {
  for (const event of listEventsByStep('buyer_order')) {
    const order = orderSchema.safeParse(JSON.parse(event.data_json))
    if (!order.success) continue
    await advanceOrder(event.message_id, order.data.thread, order.data.poNumber, payments, now)
  }
}

let running = false

export function startBuyerLoop(payments: () => BuyerPayments): void {
  setInterval(() => {
    if (running) return
    running = true
    void Promise.resolve()
      .then(() => runBuyerTick(payments()))
      .catch((error) => console.warn(`Buyer agent tick failed: ${String(error)}`))
      .finally(() => { running = false })
  }, 3000)
}
