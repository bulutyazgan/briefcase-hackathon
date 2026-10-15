import Stripe from 'stripe'
import type { BillableIntent, Decision } from '../policy/decide'
import { findClient } from '../clients/clients'
import { listInvoices, saveInvoice } from '../ledger/store'
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
  }, { idempotencyKey: `customer-${messageId}` })
  const vatTaxRateId = await ensureVatTaxRate(stripe)

  await Promise.all(decision.lines.map((line, index) => stripe.invoiceItems.create({
    customer: customer.id,
    amount: line.totalPence,
    currency: 'gbp',
    tax_rates: [vatTaxRateId],
    description: `${line.description}: ${line.quantity} at ${money(line.unitPricePence)} per lead${
      line.quantity * line.unitPricePence > line.totalPence
        ? `; agreed discount ${money(line.quantity * line.unitPricePence - line.totalPence)}`
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
