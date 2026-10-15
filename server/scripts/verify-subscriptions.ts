// Proves the subscriptions adapter against real Stripe test mode: product, price and subscription for a
// fresh customer, a replay that changes nothing, then a monthly to yearly change with prorations (P13).
// Usage (from server/): STRIPE_SECRET_KEY=sk_test_... bun scripts/verify-subscriptions.ts
import type { Client } from '../src/features/clients/clients'
import type { MemoryFact } from '../src/features/policy/decide'
import type { DiscountTerms } from '../src/features/pricing/discount'
import { DEFAULT_PLAN, quotePlan } from '../src/features/subscriptions/catalogue'
import { stripeSubscriptionGateway } from '../src/features/subscriptions/subscriptions'

const key = process.env.STRIPE_SECRET_KEY
if (!key?.startsWith('sk_test_') && !key?.startsWith('rk_test_')) {
  console.error('No Stripe test key. Export STRIPE_SECRET_KEY=sk_test_... or rk_test_... to verify subscriptions.')
  process.exit(2)
}

const runId = crypto.randomUUID().slice(0, 8)
const client: Client = {
  name: 'Northwind Capital',
  aliases: ['northwind'],
  pricePerLeadPence: 400,
  billingEmail: `billing+northwind-verify-${runId}@example.com`,
  accountOwner: 'Bulut',
}
const facts: MemoryFact[] = [{ fact: 'Agreed 10% off orders over 200 leads', date: '2026-08-12' }]
const discount: DiscountTerms = { percent: 10, threshold: 200, date: '2026-08-12', fact: 'Agreed 10% off orders over 200 leads' }
const monthly = quotePlan(DEFAULT_PLAN, 'month', client, discount, facts)
const yearly = quotePlan(DEFAULT_PLAN, 'year', client, discount, facts)
if (monthly.unitAmountPence !== 40000 || yearly.unitAmountPence !== 432000) {
  console.error(`FAIL catalogue math: monthly ${monthly.unitAmountPence}p, yearly ${yearly.unitAmountPence}p`)
  process.exit(1)
}

const gateway = stripeSubscriptionGateway()
const first = await gateway.subscribe(client, monthly, `verify-subscriptions-${runId}-monthly`)
console.info(`OK   customer=${first.customerId} product=${first.productId} price=${first.priceId} subscription=${first.subscriptionId} (${first.action}, £400.00 net per month, next invoice ${first.nextInvoiceDate})`)
if (first.action !== 'created') {
  console.error(`FAIL expected a created subscription for a fresh customer, got ${first.action}`)
  process.exit(1)
}

const replay = await gateway.subscribe(client, monthly, `verify-subscriptions-${runId}-monthly`)
if (replay.subscriptionId !== first.subscriptionId || replay.action !== 'unchanged') {
  console.error(`FAIL replay returned ${replay.subscriptionId} (${replay.action}), expected ${first.subscriptionId} unchanged`)
  process.exit(1)
}
console.info('OK   replay of the same plan changed nothing')

const second = await gateway.subscribe(client, yearly, `verify-subscriptions-${runId}-yearly`)
if (second.subscriptionId !== first.subscriptionId || second.action !== 'updated') {
  console.error(`FAIL yearly switch returned ${second.subscriptionId} (${second.action}), expected ${first.subscriptionId} updated`)
  process.exit(1)
}
console.info(`OK   switched to yearly: price=${second.priceId} (£4,320.00 net per year) subscription=${second.subscriptionId} updated with prorations, next invoice ${second.nextInvoiceDate}`)
