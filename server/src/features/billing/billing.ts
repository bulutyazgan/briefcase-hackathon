import Stripe from 'stripe'
import type { BillableIntent, Decision } from '../policy/decide'
import { getMessage, listInvoices, saveInvoice } from '../ledger/store'

export class BillingBlockedError extends Error {}

function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey?.startsWith('sk_test_') && !secretKey?.startsWith('rk_test_')) {
    throw new BillingBlockedError('Stripe billing requires a key that starts with sk_test_ or rk_test_.')
  }
  return new Stripe(secretKey)
}

export async function createInvoice(
  messageId: string,
  intent: BillableIntent,
  decision: Decision,
): Promise<{ stripeInvoiceId: string; hostedUrl: string }> {
  const existing = listInvoices().find((invoice) => invoice.message_id === messageId)
  if (existing?.stripe_invoice_id && existing.hosted_url) {
    return { stripeInvoiceId: existing.stripe_invoice_id, hostedUrl: existing.hosted_url }
  }

  const stripe = getStripe()
  const sourceMessage = getMessage(messageId)
  const email = 'billing+northwind@example.com'
  const customerMatches = await stripe.customers.list({ email, limit: 1 })
  const customer = customerMatches.data[0] ?? await stripe.customers.create({
    name: intent.clientName,
    email,
  }, { idempotencyKey: `customer-${messageId}` })

  await Promise.all(decision.lines.map((line, index) => stripe.invoiceItems.create({
    customer: customer.id,
    amount: line.totalPence,
    currency: 'gbp',
    description: `${line.description}: ${line.quantity} at £4.00 per lead${
      line.quantity * line.unitPricePence > line.totalPence
        ? `; agreed discount £${((line.quantity * line.unitPricePence - line.totalPence) / 100).toFixed(2)}`
        : ''
    }`,
  }, { idempotencyKey: `invoice-item-${messageId}-${index}` })))

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 7,
    metadata: { message_id: messageId, decision_clauses: decision.clauses.join(',') },
  }, { idempotencyKey: `invoice-${messageId}` })
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id, {}, {
    idempotencyKey: `finalize-${messageId}`,
  })
  const hostedUrl = finalized.hosted_invoice_url
  if (!hostedUrl) throw new Error('Stripe did not return a hosted invoice URL.')
  saveInvoice({
    id: messageId,
    message_id: messageId,
    stripe_invoice_id: finalized.id,
    client_id: customer.id,
    total_pence: decision.totalPence,
    status: finalized.status ?? 'open',
    hosted_url: hostedUrl,
    pdf_path: null,
  })
  return { stripeInvoiceId: finalized.id, hostedUrl }
}

export async function readStripeInvoiceStatus(stripeInvoiceId: string): Promise<string> {
  const stripe = getStripe()
  const invoice = await stripe.invoices.retrieve(stripeInvoiceId)
  return invoice.status ?? 'unknown'
}
