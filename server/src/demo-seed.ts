// Resets the ledger and seeds the "Said, done, billed" demo state:
//   - Northwind's unprocessed need (the opportunity tick turns it into an offer),
//   - Globex's delivered 50-lead invoice, open for 10 days with no remembered dispute,
//     so the collections tick sends a reminder and the dispute beat issues a credit note,
//   - client facts and the company knowledge base written to Cognee when keys exist.
// Client facts live in seed/memory.json, the company knowledge base in seed/company.json.
//
//   bun run demo:seed            (reads server/.env)
//   TALLY_DB_PATH=/tmp/x.db bun run demo:seed
import { cogneeConfigFromEnv } from './features/memory/providers/cognee'
import { seedCompanyKnowledge } from './features/memory/company'
import { knownClientNames, seedClientMemoryToCognee } from './features/memory/memory'
import { insertMessage, recordEvent, resetLedger, saveInvoice, setSetting } from './features/ledger/store'

const DAY_MS = 86400000
const GLOBEX_INVOICE_AGE_DAYS = 10
const GLOBEX_LEADS = 50
const GLOBEX_PRICE_PENCE = 400

export interface DemoSeedResult {
  northwindNeedId: string
  globexOrderId: string
  globexInvoiceId: string
  globexStripeInvoiceId: string
  cogneeDatasets: string[]
}

function sqliteStamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export function seedLedger(now = new Date()): Omit<DemoSeedResult, 'cogneeDatasets'> {
  resetLedger()
  setSetting('control.paused', 'false')

  const northwindNeedId = crypto.randomUUID()
  insertMessage({
    id: northwindNeedId,
    channel: 'simulator',
    thread: northwindNeedId,
    author: 'Client — Northwind',
    text: "We're launching the Q4 push next month and the pipeline is thin.",
    ts: now.toISOString(),
    processed_at: null,
  })

  const orderedAt = new Date(now.getTime() - GLOBEX_INVOICE_AGE_DAYS * DAY_MS)
  const globexOrderId = crypto.randomUUID()
  const globexStripeInvoiceId = process.env.DEMO_GLOBEX_STRIPE_INVOICE_ID ?? 'in_seed_globex_q3'
  const totalPence = GLOBEX_LEADS * GLOBEX_PRICE_PENCE
  insertMessage({
    id: globexOrderId,
    channel: 'simulator',
    thread: globexOrderId,
    author: 'Client — Globex',
    text: 'Go ahead, order 50 heads of procurement at UK manufacturers.',
    ts: orderedAt.toISOString(),
    processed_at: orderedAt.toISOString(),
  })
  // The collections role finds the client through the decide step, like any live order.
  recordEvent({
    id: crypto.randomUUID(),
    message_id: globexOrderId,
    step: 'decide',
    summary: `Priced ${GLOBEX_LEADS} leads for Globex Partners at £4.00 each: £200.00 net, within the £1,000 auto-send limit.`,
    data_json: JSON.stringify({
      intent: { clientName: 'Globex Partners', quantity: GLOBEX_LEADS, quote: 'Go ahead, order 50 heads of procurement at UK manufacturers.' },
      totalPence,
      autoSend: true,
    }),
    policy_clause: 'P2, P4',
  })
  recordEvent({
    id: crypto.randomUUID(),
    message_id: globexOrderId,
    step: 'invoice_created',
    summary: `Invoice created for £200.00 net + £40.00 VAT (20%) = £240.00, 50 leads delivered, due on 7-day terms.`,
    data_json: JSON.stringify({ stripeInvoiceId: globexStripeInvoiceId, totalPence, leads: GLOBEX_LEADS }),
    policy_clause: 'P6',
  })
  saveInvoice({
    id: globexOrderId,
    message_id: globexOrderId,
    stripe_invoice_id: globexStripeInvoiceId,
    client_id: null,
    total_pence: totalPence,
    status: 'open',
    hosted_url: null,
    pdf_path: null,
    created_at: sqliteStamp(orderedAt),
  })
  return { northwindNeedId, globexOrderId, globexInvoiceId: globexOrderId, globexStripeInvoiceId }
}

export async function seedCognee(): Promise<string[]> {
  if (!cogneeConfigFromEnv()) return []
  const written: string[] = []
  for (const clientName of await knownClientNames()) {
    if (await seedClientMemoryToCognee(clientName)) written.push(clientName)
  }
  const company = await seedCompanyKnowledge()
  if (company.written > 0) written.push(`company@${company.version}`)
  return written
}

export async function runDemoSeed(): Promise<DemoSeedResult> {
  const ledger = seedLedger()
  const cogneeDatasets = await seedCognee()
  return { ...ledger, cogneeDatasets }
}

if (import.meta.main) {
  const result = await runDemoSeed()
  console.info(JSON.stringify(result, null, 2))
  console.info(
    `Ledger reset: Northwind need ${result.northwindNeedId.slice(0, 8)}, Globex invoice ${result.globexStripeInvoiceId} open ${GLOBEX_INVOICE_AGE_DAYS} days.`
    + (result.cogneeDatasets.length ? ` Cognee: ${result.cogneeDatasets.join(', ')}.` : ' Cognee: no keys, facts stay local.'),
  )
}
