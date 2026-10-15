// Proves layer A against real Stripe test mode: a small invoice with a PO passes B1-B3 and the
// buyer agent pays it with pm_card_visa. Usage (from server/): STRIPE_SECRET_KEY=sk_test_... bun scripts/verify-buyer.ts
import { getStripe } from '../src/features/billing/billing'
import { evaluateInvoice } from '../src/features/buyer/policy'
import { stripePayments } from '../src/features/buyer/providers/stripe-payments'

const key = process.env.STRIPE_SECRET_KEY
if (!key?.startsWith('sk_test_') && !key?.startsWith('rk_test_')) {
  console.error('No Stripe test key. Export STRIPE_SECRET_KEY=sk_test_... to verify the buyer agent.')
  process.exit(2)
}

const stripe = getStripe()
const poNumber = 'PO-2026-VERIFY'
const runId = crypto.randomUUID()
const customer = await stripe.customers.create({ name: 'Northwind Capital (buyer verify)', email: 'buyer-verify@example.com' })
await stripe.invoiceItems.create({
  customer: customer.id,
  amount: 400,
  currency: 'gbp',
  description: 'Leads: verify: 1 at £4.00 per lead',
}, { idempotencyKey: `verify-buyer-item-${runId}` })
const draft = await stripe.invoices.create({
  customer: customer.id,
  collection_method: 'send_invoice',
  days_until_due: 7,
  pending_invoice_items_behavior: 'include',
  metadata: { po_number: poNumber },
})
if (!draft.id) throw new Error('Stripe returned a draft invoice without an id.')
await stripe.invoices.finalizeInvoice(draft.id)

const payments = stripePayments(stripe)
const invoice = await payments.retrieveInvoice(draft.id)
const verdict = evaluateInvoice(invoice, poNumber, 0)
if (!verdict.ok) {
  console.error(`FAIL ${verdict.clause}: ${verdict.reason}`)
  process.exit(1)
}
const first = await payments.payInvoice(invoice)
const second = await payments.payInvoice(invoice)
const charges = await stripe.invoices.retrieve(draft.id)
console.info(`OK   ${invoice.id} ${invoice.totalPence}p ${poNumber}: ${first.status}, repeat pay ${second.status}, final ${charges.status}.`)
process.exit(charges.status === 'paid' ? 0 : 1)
