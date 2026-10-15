// Proves layer E against real Stripe test mode: a 20% exclusive GB VAT rate and a taxed invoice.
// Usage (from server/): STRIPE_SECRET_KEY=sk_test_... bun scripts/verify-books.ts
import { getStripe } from '../src/features/billing/billing'
import { vatBreakdown } from '../src/features/books/books'
import { ensureVatTaxRate } from '../src/features/books/vat-rate'

const key = process.env.STRIPE_SECRET_KEY
if (!key?.startsWith('sk_test_') && !key?.startsWith('rk_test_')) {
  console.error('No Stripe test key. Export STRIPE_SECRET_KEY=sk_test_... or rk_test_... to verify books.')
  process.exit(2)
}

const stripe = getStripe()
const taxRateId = await ensureVatTaxRate(stripe)
console.info(`OK   tax rate ${taxRateId} (VAT 20% exclusive, GB)`)

const netPence = 108_000
const expected = vatBreakdown(netPence)
const customer = await stripe.customers.create({ name: 'Tally books verification', email: 'books-verify@example.com' })
const draft = await stripe.invoices.create({
  customer: customer.id,
  collection_method: 'send_invoice',
  days_until_due: 7,
  metadata: { verification: 'books' },
})
await stripe.invoiceItems.create({
  customer: customer.id,
  invoice: draft.id,
  amount: netPence,
  currency: 'gbp',
  description: 'Verification: 90 leads at £12.00 per lead',
  tax_rates: [taxRateId],
})
const invoice = await stripe.invoices.finalizeInvoice(draft.id)
const vatPence = (invoice.total_taxes ?? []).reduce((sum, tax) => sum + tax.amount, 0)
console.info(`     invoice ${invoice.id} ${invoice.hosted_invoice_url ?? ''}`)
console.info(`     subtotal ${invoice.subtotal} · VAT ${vatPence} · total ${invoice.total} (pence)`)

const ok = invoice.subtotal === expected.netPence && vatPence === expected.vatPence && invoice.total === expected.grossPence
console.info(ok ? 'OK   Stripe totals match the journal VAT math.' : `FAIL expected ${JSON.stringify(expected)}`)
process.exit(ok ? 0 : 1)
