// One-shot driver for a stack started by e2e/stack.ts. Each call opens headless
// Chromium on the web UI, performs one user action, waits for the UI to settle,
// and writes a screenshot + ARIA snapshot to e2e/artifacts/drive/.
//
//   bun e2e/drive.ts send "<text>" [--as "Account owner"]
//   bun e2e/drive.ts approve | reject
//   bun e2e/drive.ts pay                       # pay the newest invoice on its hosted page
//   bun e2e/drive.ts thread-reply "<text>"     # reply in the newest invoice's thread (Slack-style)
//   bun e2e/drive.ts post "<author>" "<text>"  # message from a sender the UI select lacks
//   bun e2e/drive.ts snap <name>
//   bun e2e/drive.ts state | log               # read-only ledger / mock-provider summaries
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import type { LoggedRequest } from './mock-providers/server'
import { approvalCard, ledger, openInbox, openInvoicePage, postSimulatorMessage, sendFromSimulator, stripeInvoiceLink } from './support/harness'
import { apiBase, artifactsDir, chromePath, mockBase, webBase } from './support/stack'

const [command = 'snap', ...rest] = process.argv.slice(2)
const asIndex = rest.indexOf('--as')
const author = asIndex >= 0 ? rest[asIndex + 1] : undefined
const args = asIndex >= 0 ? rest.slice(0, asIndex) : rest
const outDir = join(artifactsDir, 'drive')

async function evidence(page: Page, name: string): Promise<void> {
  await mkdir(outDir, { recursive: true })
  const stem = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}`)
  await page.screenshot({ path: `${stem}.png`, fullPage: true })
  await Bun.write(`${stem}.aria.txt`, await page.locator('main').ariaSnapshot())
  console.info(`evidence: ${stem}.png ${stem}.aria.txt`)
}

if (command === 'state') {
  const state = await ledger(apiBase)
  console.info(JSON.stringify({
    messages: state.messages.map((message) => `${message.author}: ${message.text.split('\n')[0]}`),
    invoices: state.invoices.map((invoice) => `${invoice.stripe_invoice_id} ${invoice.total_pence}p ${invoice.status}`),
    approvals: state.approvals.map((approval) => `${approval.message_id.slice(0, 8)} ${approval.status}`),
  }, null, 2))
  process.exit(0)
}
if (command === 'log') {
  const log: LoggedRequest[] = await (await fetch(`${mockBase}/__log`)).json()
  for (const entry of log) console.info(`${entry.provider} ${entry.method} ${entry.path}${entry.query} → ${entry.status}`)
  process.exit(0)
}

const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  await openInbox(page, webBase)
  if (command === 'send') {
    if (author) await page.getByLabel('Send as').selectOption(author)
    await sendFromSimulator(page, args.join(' '))
  } else if (command === 'approve' || command === 'reject') {
    await approvalCard(page).getByRole('button', { name: command === 'approve' ? 'Approve invoice' : 'Reject' }).click()
  } else if (command === 'pay') {
    const newest = (await ledger(apiBase)).invoices[0]
    if (!newest) throw new Error('No invoice to pay.')
    await openInvoicePage(page, webBase, newest.id)
    const href = await stripeInvoiceLink(page).getAttribute('href')
    const hosted = await browser.newPage()
    await hosted.goto(href ?? '')
    await hosted.getByRole('button', { name: 'Pay with 4242' }).click()
    await hosted.getByTestId('paid').waitFor()
    await mkdir(outDir, { recursive: true })
    await hosted.screenshot({ path: join(outDir, `${Date.now()}-hosted-paid.png`) })
  } else if (command === 'thread-reply') {
    const state = await ledger(apiBase)
    const invoice = state.invoices[0]
    const thread = state.messages.find((message) => message.id === invoice?.message_id)?.thread
    if (!thread) throw new Error('No invoice thread to reply in.')
    await postSimulatorMessage(apiBase, author ?? 'Client — Northwind', args.join(' '), thread)
  } else if (command === 'post') {
    await postSimulatorMessage(apiBase, args[0] ?? '', args.slice(1).join(' '))
  } else if (command !== 'snap') {
    throw new Error(`Unknown command ${command}`)
  }
  // The agent loop ticks every 2s and the invoice poller every 10s.
  await Bun.sleep(command === 'pay' ? 12000 : 5000)
  await evidence(page, command === 'snap' ? (args[0] ?? 'snap') : command)
} finally {
  await browser.close()
}
