// Proves layer D against real Stripe test mode: a finalised invoice, then a credit note for invalid leads (P11).
// Usage (from server/): STRIPE_SECRET_KEY=sk_test_... bun scripts/verify-credit-notes.ts
import { getStripe } from '../src/features/billing/billing'
import { stripeCreditNoteIssuer } from '../src/features/credit-notes/credit-notes'

const key = process.env.STRIPE_SECRET_KEY
if (!key?.startsWith('sk_test_') && !key?.startsWith('rk_test_')) {
  console.error('No Stripe test key. Export STRIPE_SECRET_KEY=sk_test_... or rk_test_... to verify credit notes.')
  process.exit(2)
}

const stripe = getStripe()
const runId = crypto.randomUUID()
const customer = await stripe.customers.create(
  { name: 'Globex Partners', email: 'billing+globex@example.com' },
  { idempotencyKey: `verify-cn-customer-${runId}` },
)
await stripe.invoiceItems.create(
  { customer: customer.id, amount: 120000, currency: 'gbp', description: 'Leads: 300 at £4.00 per lead' },
  { idempotencyKey: `verify-cn-item-${runId}` },
)
const draft = await stripe.invoices.create(
  { customer: customer.id, collection_method: 'send_invoice', days_until_due: 7 },
  { idempotencyKey: `verify-cn-invoice-${runId}` },
)
const invoice = await stripe.invoices.finalizeInvoice(draft.id)
console.info(`OK   invoice ${invoice.id} finalised for £${(invoice.total / 100).toFixed(2)}`)

const issuer = stripeCreditNoteIssuer()
const request = {
  stripeInvoiceId: invoice.id,
  description: 'Credit for 30 invalid leads',
  quantity: 30,
  unitAmountPence: 400,
  memo: 'Client dispute: “30 of those leads were invalid”. Credited 30 of 300 delivered leads (P11).',
}
const first = await issuer.create(request, `credit-note-verify-${runId}`)
const replay = await issuer.create(request, `credit-note-verify-${runId}`)
console.info(`OK   credit note ${first.id} for £${(first.totalPence / 100).toFixed(2)}`)
if (replay.id !== first.id || first.totalPence !== 12000) {
  console.error(`FAIL replay returned ${replay.id}, expected ${first.id} for £120.00`)
  process.exit(1)
}
console.info('OK   replay with the same idempotency key returned the same credit note')
