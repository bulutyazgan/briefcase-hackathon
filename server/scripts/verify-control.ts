// Proves the least-privilege guardrail (F2): a restricted rk_test_ key cannot refund, pay out or charge.
// Usage (from server/): STRIPE_SECRET_KEY=rk_test_... bun scripts/verify-control.ts
import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('No STRIPE_SECRET_KEY set. Export a restricted rk_test_ key to verify the guardrail.')
  process.exit(2)
}
if (!key.startsWith('rk_test_')) {
  console.error(`STRIPE_SECRET_KEY is not a restricted test key (prefix ${key.slice(0, 8)}). Use an rk_test_ key.`)
  process.exit(2)
}

const stripe = new Stripe(key)
const forbidden: { name: string; call: () => Promise<unknown> }[] = [
  { name: 'refunds.list', call: () => stripe.refunds.list({ limit: 1 }) },
  { name: 'payouts.list', call: () => stripe.payouts.list({ limit: 1 }) },
  { name: 'charges.create', call: () => stripe.charges.create({ amount: 100, currency: 'gbp', source: 'tok_visa' }) },
]

let failures = 0
for (const { name, call } of forbidden) {
  try {
    await call()
    failures += 1
    console.error(`FAIL ${name}: Stripe allowed the call. The key is not least-privilege.`)
  } catch (error) {
    if (error instanceof Stripe.errors.StripePermissionError) {
      console.info(`OK   ${name}: Stripe rejected it with a permission error (${error.statusCode ?? 403}).`)
    } else {
      failures += 1
      console.error(`FAIL ${name}: unexpected error ${String(error)}`)
    }
  }
}

try {
  await stripe.customers.list({ limit: 1 })
  console.info('OK   customers.list: allowed, as billing requires.')
} catch (error) {
  failures += 1
  console.error(`FAIL customers.list: the key cannot read customers: ${String(error)}`)
}

if (failures) process.exit(1)
console.info('Guardrail verified: even a prompt-injected agent cannot refund, pay out or create charges.')
