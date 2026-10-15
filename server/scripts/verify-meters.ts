// Creates (or finds) the qualified_lead meter and sends one meter event to the Stripe test API.
// Run from server/: STRIPE_SECRET_KEY=sk_test_... bun scripts/verify-meters.ts
import { getStripe } from '../src/features/billing/billing'
import { ensureQualifiedLeadMeter, METER_EVENT_NAME } from '../src/features/meters/meters'

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY is not set. Add a Stripe test key and rerun: bun scripts/verify-meters.ts')
  process.exit(1)
}

const stripe = getStripe()
const meterId = await ensureQualifiedLeadMeter(stripe)
console.log(`meter=${meterId} event_name=${METER_EVENT_NAME}`)

const customer = await stripe.customers.create({ name: 'Tally meter verification' })
const identifier = `verify-meters-${crypto.randomUUID()}`
const event = await stripe.billing.meterEvents.create({
  event_name: METER_EVENT_NAME,
  identifier,
  payload: { stripe_customer_id: customer.id, value: '1' },
}, { idempotencyKey: identifier })
console.log(`meter_event identifier=${event.identifier} customer=${customer.id} created=${event.created}`)
if (event.identifier !== identifier) process.exit(1)
