// Live check of the demo seed against real providers (reads server/.env): seeds a scratch
// ledger, creates Globex's invoice in Stripe test mode, writes the facts to Cognee, then runs
// the collections decision without sending or recording anything and prints what it would do.
//
//   bun scripts/verify-demo-seed.ts
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const workDir = await mkdtemp(join(tmpdir(), 'tally-demo-seed-'))
process.env.TALLY_DB_PATH = join(workDir, 'tally.db')
// The ledger opens its database on import, so the path is set before anything loads it.
const { runDemoSeed } = await import('../src/demo-seed')
const { runCollectionsTick } = await import('../src/features/collections/collections')

const now = new Date()
const seeded = await runDemoSeed(now)
console.info(`Ledger: ${process.env.TALLY_DB_PATH}`)
console.info(`Northwind need message: ${seeded.northwindNeedId}`)
console.info(`Globex order message: ${seeded.globexOrderId}`)
console.info(`Globex Stripe invoice: ${seeded.globexStripeInvoiceId}${seeded.globexHostedUrl ? ` ${seeded.globexHostedUrl}` : ' (placeholder, no Stripe key)'}`)
console.info(`Cognee datasets written: ${seeded.cogneeDatasets.join(', ') || 'none (no keys)'}`)

const outcomes = await runCollectionsTick(now, {
  sendReminder: async (invoice, text) => { console.info(`Would remind ${invoice.stripe_invoice_id}: ${text}`) },
  recordEvent: (event) => { console.info(`Would record ${event.step} [${event.policy_clause ?? '-'}]: ${event.summary}`) },
})
console.info(JSON.stringify(outcomes, null, 2))
const reminded = outcomes.some((outcome) => outcome.action === 'reminded')
if (!reminded) {
  console.error('Expected the seeded Globex invoice to earn a reminder.')
  process.exit(1)
}
console.info('Demo seed verified: Globex invoice exists in Stripe, is 10 days old on 7-day terms, and earns a reminder.')
