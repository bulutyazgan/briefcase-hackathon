import Stripe from 'stripe'
import type { BillableIntent, Decision } from '../policy/decide'
import { findClient } from '../clients/clients'
import { getInvoice, getMessage, listInvoices, saveInvoice } from '../ledger/store'
import { extractPoNumber } from '../buyer/policy'
import { ensureVatTaxRate } from '../books/vat-rate'

export class BillingBlockedError extends Error {}

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey?.startsWith('sk_test_') && !secretKey?.startsWith('rk_test_')) {
    throw new BillingBlockedError('Stripe billing requires a key that starts with sk_test_ or rk_test_.')
  }
  // Mock harness: STRIPE_API_BASE (e.g. http://127.0.0.1:4010) points the SDK at a local mock.
  const apiBase = process.env.STRIPE_API_BASE
  if (apiBase) {
    const url = new URL(apiBase)
    const protocol = url.protocol === 'http:' ? 'http' : 'https'
    return new Stripe(secretKey, {
      host: url.hostname,
      port: url.port ? Number(url.port) : protocol === 'http' ? 80 : 443,
      protocol,
    })
  }
  return new Stripe(secretKey)
}

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
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
  const client = findClient(intent.clientName)
  if (!client) throw new BillingBlockedError(`Unknown client "${intent.clientName}" (P5).`)
  const email = client.billingEmail
  const customerMatches = await stripe.customers.list({ email, limit: 1 })
  const customer = customerMatches.data[0] ?? await stripe.customers.create({
    name: client.name,
    email,
    metadata: { tally_client: client.name },
  }, { idempotencyKey: `customer-${messageId}` })
  const vatTaxRateId = await ensureVatTaxRate(stripe)

  // Draft first, items attached to it: since API 2022-08-01 pending items are not pulled into new invoices.
  const poNumber = extractPoNumber(getMessage(messageId)?.text ?? intent.ask)
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 7,
    auto_advance: false,
    metadata: { message_id: messageId, client: client.name, decision_clauses: decision.clauses.join(','), ...(poNumber ? { po_number: poNumber } : {}) },
    ...(poNumber ? { description: `Purchase order ${poNumber}` } : {}),
  }, { idempotencyKey: `invoice-${messageId}` })
  await Promise.all(decision.lines.map((line, index) => stripe.invoiceItems.create({
    customer: customer.id,
    invoice: invoice.id,
    amount: line.totalPence,
    currency: 'gbp',
    tax_rates: [vatTaxRateId],
    description: `${line.description}: ${line.quantity} at ${money(line.unitPricePence)} per lead${
      line.quantity * line.unitPricePence > line.totalPence
        ? `; agreed discount ${money(line.quantity * line.unitPricePence - line.totalPence)}`
        : ''
    }`,
  }, { idempotencyKey: `invoice-item-${messageId}-${index}` })))

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
