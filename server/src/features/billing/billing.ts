import Stripe from 'stripe'
import { RATE_PENCE, type BillableIntent, type Decision } from '../policy/decide'
import { findClient } from '../memory/memory'
import { getInvoice, listInvoices, saveInvoice, type InvoiceRow } from '../ledger/store'

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

  const client = findClient(intent.clientName)
  if (!client) throw new Error('Cannot bill an unknown client.')
  const stripe = getStripe()
  const customerMatches = await stripe.customers.list({ email: client.email, limit: 1 })
  const customer = customerMatches.data[0] ?? await stripe.customers.create({
    name: client.name,
    email: client.email,
    metadata: { tally_client_id: client.id },
  }, { idempotencyKey: `customer-${messageId}` })

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    currency: 'gbp',
    collection_method: 'send_invoice',
    days_until_due: 7,
    auto_advance: false,
    metadata: {
      message_id: messageId,
      client_id: client.id,
      decision_clauses: decision.clauses.join(','),
    },
  }, { idempotencyKey: `invoice-gbp-${messageId}` })

  for (const [index, line] of decision.lines.entries()) {
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: line.totalPence,
      currency: 'gbp',
      description: `${line.description}: ${line.quantity} at £${(RATE_PENCE / 100).toFixed(2)} per lead${
        line.quantity * line.unitPricePence > line.totalPence
          ? `; agreed discount £${((line.quantity * line.unitPricePence - line.totalPence) / 100).toFixed(2)}`
          : ''
      }`,
    }, { idempotencyKey: `invoice-item-gbp-${messageId}-${index}` })
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id, {}, {
    idempotencyKey: `finalize-gbp-${messageId}`,
  })
  await stripe.invoices.sendInvoice(finalized.id, {}, {
    idempotencyKey: `send-gbp-${messageId}`,
  }).catch((error: unknown) => {
    console.error('Stripe could not email the invoice.', error)
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

export async function simulateInvoicePayment(invoiceId: string): Promise<void> {
  const invoice = getInvoice(invoiceId)
  if (!invoice?.stripe_invoice_id || !invoice.client_id || invoice.status !== 'open') {
    throw new Error('Only an open Stripe invoice can use the test-card payment.')
  }

  const stripe = getStripe()
  const testCard = await stripe.paymentMethods.attach('pm_card_visa', { customer: invoice.client_id })
  await stripe.invoices.pay(invoice.stripe_invoice_id, {
    payment_method: testCard.id,
  }, { idempotencyKey: `simulate-payment-${invoice.id}` })
}

export async function readStripeInvoiceStatus(stripeInvoiceId: string): Promise<string> {
  const stripe = getStripe()
  const invoice = await stripe.invoices.retrieve(stripeInvoiceId)
  return invoice.status ?? 'unknown'
}
