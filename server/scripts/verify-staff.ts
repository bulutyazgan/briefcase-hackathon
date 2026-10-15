// Live check of the staff channel against a scratch Tally server with the real keys in server/.env:
// posts the Northwind order to the simulator channel, approves it when the order needs approval,
// waits for the Stripe invoice, then prints every staff note from GET /api/staff/notes.
// Usage (from server/): bun scripts/verify-staff.ts
import { rmSync } from 'node:fs'
import { z } from 'zod'

const port = Number(process.env.VERIFY_PORT ?? 8798)
const api = `http://127.0.0.1:${port}`
const dbPath = `/tmp/tally-verify-staff-${Date.now()}.db`
const author = 'Client — Northwind'
const order = process.env.VERIFY_ORDER ?? "Let's go ahead with 300 fintech CFO leads in London. Signals: just raised, hiring."

const messageSchema = z.object({ id: z.string(), thread: z.string(), author: z.string(), text: z.string(), processed_at: z.string().nullable() })
const stateSchema = z.object({
  messages: z.array(messageSchema),
  approvals: z.array(z.object({ message_id: z.string(), status: z.string(), reason: z.string() })),
  invoices: z.array(z.object({ id: z.string(), stripe_invoice_id: z.string().nullable(), total_pence: z.number(), status: z.string() })),
  events: z.array(z.object({ message_id: z.string(), step: z.string(), summary: z.string(), policy_clause: z.string().nullable() })),
})
const notesSchema = z.object({ notes: z.array(z.object({ id: z.string(), messageId: z.string(), kind: z.string(), text: z.string(), clauses: z.array(z.string()), createdAt: z.string() })) })
const VENDOR_NAMES = ['treg', 'cognee', 'firecrawl', 'apollo', 'openai', 'fireworks']

async function waitFor<T>(label: string, read: () => Promise<T | null | undefined>, timeoutMs = 120000): Promise<T> {
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

async function notes() {
  return notesSchema.parse(await (await fetch(`${api}/api/staff/notes`)).json()).notes
}

async function post(text: string): Promise<{ id: string; thread: string }> {
  const response = await fetch(`${api}/api/channels/simulator/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author, text }),
  })
  return z.object({ message: messageSchema }).parse(await response.json()).message
}

const server = Bun.spawn(['bun', 'src/index.ts'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(port), TALLY_DB_PATH: dbPath },
  stdout: 'inherit',
  stderr: 'inherit',
})
try {
  await waitFor('server health', async () => (await fetch(`${api}/health`)).ok ? true : null, 30000)
  console.info(`Staff channel: ${process.env.STAFF_SLACK_CHANNEL ? 'Slack' : ''}${process.env.STAFF_TELEGRAM_CHAT_ID ? ' Telegram' : ''}`.trim() || 'Staff channel: none configured, notes are recorded only.')

  const commitment = await post(order)
  console.info(`\nOrder ${commitment.id}: ${order}`)
  const settled = await waitFor('an approval request or a decision', async () => {
    const current = await state()
    const approval = current.approvals.find((entry) => entry.message_id === commitment.id)
    const invoice = current.invoices.find((entry) => entry.id === commitment.id)
    const refused = current.events.find((event) => event.message_id === commitment.id && event.step === 'decide' && /refuse/i.test(event.summary))
    return approval || invoice || refused ? { approval, invoice, refused } : null
  })
  if (settled.refused) throw new Error(`The order was refused: ${settled.refused.summary}`)
  if (settled.approval?.status === 'pending') {
    console.info(`Approval ${settled.approval.message_id} pending: ${settled.approval.reason}`)
    const approved = await fetch(`${api}/api/approvals/${commitment.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) })
    console.info(`Approve → ${approved.status}`)
  }
  const invoice = await waitFor('the Stripe invoice', async () =>
    (await state()).invoices.find((entry) => entry.id === commitment.id && entry.stripe_invoice_id))
  console.info(`Invoice ${invoice.id}: ${invoice.stripe_invoice_id} for £${(invoice.total_pence / 100).toFixed(2)} (${invoice.status})`)

  await waitFor('the invoice staff note', async () => (await notes()).find((note) => note.kind === 'invoice' && note.messageId === commitment.id))
  const all = await notes()
  console.info(`\nStaff notes (${all.length}, newest first):`)
  for (const note of all) {
    console.info(`- [${note.createdAt}] ${note.kind} (${note.clauses.join(', ') || '-'}): ${note.text}`)
    const leaked = VENDOR_NAMES.filter((name) => note.text.toLowerCase().includes(name))
    if (leaked.length) throw new Error(`Note ${note.id} leaks a provider name: ${leaked.join(', ')}`)
  }
  const kinds = new Set(all.map((note) => note.kind))
  if (!kinds.has('invoice')) throw new Error('No invoice staff note was recorded.')
  if (settled.approval && !kinds.has('approval')) throw new Error('No approval staff note was recorded.')
  const createdAt = all.map((note) => note.createdAt)
  if ([...createdAt].sort().reverse().join() !== createdAt.join()) throw new Error('Notes are not newest first.')
  console.info(`\nOK: ${all.length} staff notes recorded for ${commitment.id} (invoice ${invoice.stripe_invoice_id}); no provider names; newest first.`)
} finally {
  server.kill()
  rmSync(dbPath, { force: true })
}
