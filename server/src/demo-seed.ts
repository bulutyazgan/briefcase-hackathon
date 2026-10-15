// Resets the ledger and seeds the "Said, done, billed" demo state:
//   - Northwind's unprocessed need (the opportunity tick turns it into an offer),
//   - Globex's delivered 50-lead invoice, created through the real billing path (Stripe
//     test mode, or the mock when STRIPE_API_BASE points at it), then backdated 10 days
//     with no remembered dispute, so the collections tick sends a reminder and a dispute
//     earns a credit note against a Stripe invoice that exists,
//   - client facts and the company knowledge base written to Cognee when keys exist.
// Client facts live in seed/memory.json, the company knowledge base in seed/company.json.
//
//   bun run demo:seed            (reads server/.env)
//   TALLY_DB_PATH=/tmp/x.db bun run demo:seed
import { BillingBlockedError, createInvoice } from './features/billing/billing'
import { cogneeConfigFromEnv } from './features/memory/providers/cognee'
import { seedCompanyKnowledge } from './features/memory/company'
import { knownClientNames, recallSeededFacts, seedClientMemoryToCognee } from './features/memory/memory'
import { backdateInvoice, insertMessage, recordEvent, resetLedger, saveInvoice, setSetting } from './features/ledger/store'
import { decide, type BillableIntent } from './features/policy/decide'

const DAY_MS = 86400000
const GLOBEX_INVOICE_AGE_DAYS = 10
const GLOBEX_LEADS = 50
const GLOBEX_CLIENT = 'Globex Partners'
const GLOBEX_QUOTE = 'Go ahead, order 50 heads of procurement at UK manufacturers.'
const PLACEHOLDER_STRIPE_INVOICE_ID = 'in_seed_globex_q3'

export interface DemoSeedResult {
  northwindNeedId: string
  globexOrderId: string
  globexStripeInvoiceId: string
  globexHostedUrl: string | null
  cogneeDatasets: string[]
}

function globexIntent(): BillableIntent {
  return {
    isCommitment: true,
    clientName: GLOBEX_CLIENT,
    ask: '50 heads of procurement at UK manufacturers',
    icp: 'heads of procurement at UK manufacturers',
    signals: [],
    quantity: GLOBEX_LEADS,
    quote: GLOBEX_QUOTE,
  }
}

// The delivered rows the credit-note check counts a dispute against (P11).
function globexLeads(): { name: string; company: string; url: string }[] {
  return Array.from({ length: GLOBEX_LEADS }, (_, index) => ({
    name: `Procurement lead ${index + 1}`,
    company: `UK Manufacturer ${index + 1} Ltd`,
    url: `https://example.com/globex/leads/${index + 1}`,
  }))
}

export function seedLedger(now = new Date()): { northwindNeedId: string; globexOrderId: string; orderedAt: Date } {
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
  insertMessage({
    id: globexOrderId,
    channel: 'simulator',
    thread: globexOrderId,
    author: 'Client — Globex',
    text: GLOBEX_QUOTE,
    ts: orderedAt.toISOString(),
    processed_at: orderedAt.toISOString(),
  })
  return { northwindNeedId, globexOrderId, orderedAt }
}

// Prices the seeded order with the real policy, bills it through the real Stripe path when a
// key is configured (a placeholder id otherwise), records the delivery, and backdates the row.
export async function seedGlobexInvoice(globexOrderId: string, orderedAt: Date): Promise<{ stripeInvoiceId: string; hostedUrl: string | null }> {
  const intent = globexIntent()
  const facts = await recallSeededFacts(GLOBEX_CLIENT)
  const decision = decide(intent, facts, GLOBEX_LEADS)
  if (decision.outcome === 'refuse') throw new Error(`Seed order refused by policy: ${decision.reason}`)
  recordEvent({
    id: crypto.randomUUID(),
    message_id: globexOrderId,
    step: 'decide',
    summary: decision.reason,
    data_json: JSON.stringify({ intent, ...decision }),
    policy_clause: decision.clauses.join(', '),
  })
  recordEvent({
    id: crypto.randomUUID(),
    message_id: globexOrderId,
    step: 'size',
    summary: `Delivered ${GLOBEX_LEADS} leads for ${GLOBEX_CLIENT}.`,
    data_json: JSON.stringify({ leads: globexLeads() }),
    policy_clause: 'P2',
  })

  let billed: { stripeInvoiceId: string; hostedUrl: string | null }
  try {
    billed = await createInvoice(globexOrderId, intent, decision)
  } catch (error) {
    if (!(error instanceof BillingBlockedError)) throw error
    billed = { stripeInvoiceId: PLACEHOLDER_STRIPE_INVOICE_ID, hostedUrl: null }
    saveInvoice({
      id: globexOrderId,
      message_id: globexOrderId,
      stripe_invoice_id: billed.stripeInvoiceId,
      client_id: null,
      total_pence: decision.totalPence,
      status: 'open',
      hosted_url: null,
      pdf_path: null,
    })
  }
  backdateInvoice(globexOrderId, orderedAt)
  recordEvent({
    id: crypto.randomUUID(),
    message_id: globexOrderId,
    step: 'invoice_created',
    summary: `Invoice ${billed.stripeInvoiceId} created for £200.00 net + £40.00 VAT (20%) = £240.00; ${GLOBEX_LEADS} leads delivered on 7-day terms.`,
    data_json: JSON.stringify({ stripeInvoiceId: billed.stripeInvoiceId, totalPence: decision.totalPence, leads: GLOBEX_LEADS }),
    policy_clause: 'P6',
  })
  return billed
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

export async function runDemoSeed(now = new Date()): Promise<DemoSeedResult> {
  const ledger = seedLedger(now)
  const globex = await seedGlobexInvoice(ledger.globexOrderId, ledger.orderedAt)
  const cogneeDatasets = await seedCognee()
  return {
    northwindNeedId: ledger.northwindNeedId,
    globexOrderId: ledger.globexOrderId,
    globexStripeInvoiceId: globex.stripeInvoiceId,
    globexHostedUrl: globex.hostedUrl,
    cogneeDatasets,
  }
}

if (import.meta.main) {
  const result = await runDemoSeed()
  console.info(JSON.stringify(result, null, 2))
  console.info(
    `Ledger reset: Northwind need ${result.northwindNeedId.slice(0, 8)}, Globex invoice ${result.globexStripeInvoiceId} open ${GLOBEX_INVOICE_AGE_DAYS} days`
    + (result.globexHostedUrl ? ` (${result.globexHostedUrl}).` : ' (no Stripe key: placeholder id, no hosted page).')
    + (result.cogneeDatasets.length ? ` Cognee: ${result.cogneeDatasets.join(', ')}.` : ' Cognee: no keys, facts stay local.'),
  )
}
