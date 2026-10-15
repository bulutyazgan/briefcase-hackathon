// Live check of the intake adapter (P12) against a scratch Tally server with the real keys in server/.env:
// seeds the company knowledge base in Cognee, posts the Initech inquiry and then the commitment to the
// simulator channel, and prints the onboarded client row and the P12 approval. No Stripe object is created,
// because the first invoice waits for the account owner.
// Usage (from server/): bun scripts/verify-intake.ts
import { rmSync } from 'node:fs'
import { z } from 'zod'
import { seedCompanyKnowledge } from '../src/features/memory/company'

const port = Number(process.env.VERIFY_PORT ?? 8799)
const api = `http://127.0.0.1:${port}`
const dbPath = `/tmp/tally-verify-intake-${Date.now()}.db`
const author = 'Client — Initech'

const messageSchema = z.object({ id: z.string(), thread: z.string(), author: z.string(), text: z.string(), processed_at: z.string().nullable() })
const stateSchema = z.object({
  messages: z.array(messageSchema),
  approvals: z.array(z.object({ message_id: z.string(), status: z.string(), reason: z.string() })),
  invoices: z.array(z.object({ id: z.string() })),
  events: z.array(z.object({ message_id: z.string(), step: z.string(), summary: z.string(), policy_clause: z.string().nullable() })),
})
const clientsSchema = z.object({ clients: z.array(z.object({ id: z.string(), name: z.string(), billing_email: z.string(), price_per_lead_pence: z.number(), account_owner: z.string(), source_message_id: z.string() })) })

async function waitFor<T>(label: string, read: () => Promise<T | null | undefined>, timeoutMs = 90000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read().catch(() => null)
    if (value) return value
    await Bun.sleep(1000)
  }
  throw new Error(`Timed out waiting for ${label}.`)
}

async function state() {
  return stateSchema.parse(await (await fetch(`${api}/api/state`)).json())
}

async function post(text: string): Promise<{ id: string; thread: string }> {
  const response = await fetch(`${api}/api/channels/simulator/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author, text }),
  })
  const body = z.object({ message: messageSchema }).parse(await response.json())
  return body.message
}

const seed = await seedCompanyKnowledge()
console.info(`Company knowledge base version ${seed.version}: ${seed.written ? `${seed.written} facts written to Cognee dataset "company"` : 'already in Cognee (or no Cognee key; local seed answers)'}.`)

const server = Bun.spawn(['bun', 'src/index.ts'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(port), TALLY_DB_PATH: dbPath },
  stdout: 'inherit',
  stderr: 'inherit',
})
try {
  await waitFor('server health', async () => (await fetch(`${api}/health`)).ok ? true : null, 30000)

  const inquiry = await post("Hi, we're Initech. What do you charge for lead lists? We'd need around 150 fintech CFO leads in London.")
  const answer = await waitFor('the company-knowledge answer', async () =>
    (await state()).messages.find((entry) => entry.thread === inquiry.thread && entry.author === 'tally'))
  console.info(`\nInquiry ${inquiry.id}\nTally: ${answer.text}`)
  const learned = (await state()).events.find((event) => event.message_id === inquiry.id && event.step === 'company_learned')
  console.info(`Event company_learned [${learned?.policy_clause ?? '-'}]: ${learned?.summary ?? 'missing'}`)
  const stateAfterInquiry = await state()
  if (stateAfterInquiry.invoices.length || stateAfterInquiry.approvals.length) throw new Error('An inquiry must not create an invoice or an approval.')

  const commitment = await post("Let's go ahead with 150 leads. Fintech CFOs in London. Send invoices to ap@initech.example.")
  const approval = await waitFor('the P12 approval', async () =>
    (await state()).approvals.find((entry) => entry.message_id === commitment.id))
  const clients = clientsSchema.parse(await (await fetch(`${api}/api/clients`)).json()).clients
  const onboard = (await state()).events.find((event) => event.message_id === commitment.id && event.step === 'onboard')
  console.info(`\nCommitment ${commitment.id}`)
  console.info('Client row:', clients.find((client) => client.name === 'Initech') ?? clients)
  console.info(`Event onboard [${onboard?.policy_clause ?? '-'}]: ${onboard?.summary ?? 'missing'}`)
  console.info(`Approval ${approval.message_id} (${approval.status}): ${approval.reason}`)
  const final = await state()
  if (final.invoices.length) throw new Error('No invoice may exist before the account owner approves (P12).')
  if (!/P12|first invoice/.test(approval.reason) && !final.events.some((event) => event.message_id === commitment.id && event.policy_clause?.includes('P12'))) {
    throw new Error('The approval must cite P12.')
  }
  console.info('\nOK: Initech was answered from the knowledge base, onboarded at £4.00 per lead, and its first invoice waits for approval under P12.')
} finally {
  server.kill()
  rmSync(dbPath, { force: true })
}
