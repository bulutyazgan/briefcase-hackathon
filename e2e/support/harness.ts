import { mkdir } from 'node:fs/promises'
import type { Browser, Locator, Page } from 'playwright'
import type { LoggedRequest } from '../mock-providers/server'

export interface HarnessUrls {
  web: string
  api: string
  mock: string
  dbPath: string
}

export interface ScenarioContext extends HarnessUrls {
  name: string
  artifactsDir: string
  browser: Browser
  page: Page
  shot: (step: string) => Promise<void>
  mockLog: () => Promise<LoggedRequest[]>
  isPending: (id: string) => boolean
  note: (message: string) => void
}

export interface Scenario {
  id: string
  title: string
  run: (context: ScenarioContext) => Promise<void>
}

export class AssertionFailed extends Error {}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new AssertionFailed(message)
}

export async function waitFor<T>(
  description: string,
  probe: () => Promise<T | null | undefined | false>,
  timeoutMs = 30000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: unknown = null
  while (Date.now() < deadline) {
    try {
      const value = await probe()
      if (value) return value
    } catch (error) {
      last = error
    }
    await Bun.sleep(250)
  }
  throw new AssertionFailed(`Timed out waiting for ${description}${last ? ` (last error: ${String(last)})` : ''}`)
}

export function createShooter(page: Page, scenario: string, artifactsDir: string): (step: string) => Promise<void> {
  let index = 0
  return async (step: string) => {
    index += 1
    const dir = `${artifactsDir}/${scenario}`
    await mkdir(dir, { recursive: true })
    const file = `${dir}/${String(index).padStart(2, '0')}-${step}.png`
    await page.screenshot({ path: file, fullPage: true })
  }
}

export function stripeCalls(log: LoggedRequest[], method: string, pattern: RegExp): LoggedRequest[] {
  return log.filter((entry) => entry.provider === 'stripe' && entry.method === method && pattern.test(entry.path))
}

export async function sendFromSimulator(page: Page, text: string): Promise<void> {
  await page.getByLabel('Message').fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}

// Routes of the dashboard: the inbox holds the composer and approval cards, an
// invoice page holds the evidence trail and the Stripe link, the audit page the trail.
export async function openInbox(page: Page, web: string): Promise<void> {
  await page.goto(`${web}/app/inbox`)
  await page.getByRole('heading', { name: 'Client channel' }).waitFor()
  await page.getByLabel('Send as').waitFor()
}

export async function openInvoicePage(page: Page, web: string, invoiceId: string): Promise<void> {
  await page.goto(`${web}/app/invoices/${encodeURIComponent(invoiceId)}`)
  await page.getByRole('heading', { name: 'Evidence trail' }).waitFor()
}

export async function openInvoiceList(page: Page, web: string): Promise<void> {
  await page.goto(`${web}/app/invoices`)
  await page.getByRole('heading', { name: 'Invoices', exact: true }).waitFor()
}

export async function openAudit(page: Page, web: string): Promise<void> {
  await page.goto(`${web}/app/audit`)
  await page.getByRole('heading', { name: 'Audit trail' }).waitFor()
}

// An approval card is a list item under "Pending approvals" headed "Approval needed".
export function approvalCard(page: Page): Locator {
  return page.getByRole('listitem').filter({ hasText: 'Approval needed' }).first()
}

export function stripeInvoiceLink(page: Page): Locator {
  return page.getByRole('link', { name: /(View|Open) Stripe invoice/ })
}

// Invoice rows in the ledger once Stripe has created and finalized them.
export async function waitForStripeInvoice(api: string, timeoutMs = 45000): Promise<LedgerState['invoices'][number]> {
  return waitFor('a Stripe invoice in the ledger', async () => {
    const state = await ledger(api)
    return state.invoices.find((invoice) => invoice.stripe_invoice_id !== null && invoice.hosted_url !== null)
  }, timeoutMs)
}

export async function payOnHostedPage(context: ScenarioContext, hostedHref: string): Promise<void> {
  const hosted = await context.browser.newPage()
  await hosted.goto(hostedHref)
  await hosted.getByRole('button', { name: 'Pay with 4242' }).click()
  await hosted.getByTestId('paid').waitFor()
  await hosted.screenshot({ path: `${context.artifactsDir}/${context.name}/hosted-invoice-paid.png` })
  await hosted.close()
}

// The simulator UI only offers Northwind and the account owner as senders, so
// other clients are injected through the same simulator endpoint the UI uses.
export async function postSimulatorMessage(api: string, author: string, text: string, thread?: string): Promise<string> {
  const response = await fetch(`${api}/api/channels/simulator/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author, text, ...(thread ? { thread } : {}) }),
  })
  assert(response.status === 201, `simulator message rejected (${response.status})`)
  const body: unknown = await response.json()
  if (body && typeof body === 'object' && 'message' in body && body.message && typeof body.message === 'object' && 'id' in body.message) {
    return String(body.message.id)
  }
  throw new AssertionFailed('simulator response had no message id')
}

export interface LedgerState {
  messages: { id: string; author: string; text: string; thread: string; processed_at: string | null }[]
  invoices: { id: string; message_id: string; stripe_invoice_id: string | null; total_pence: number; status: string; hosted_url: string | null }[]
  approvals: { id: string; message_id: string; status: string }[]
  events: { message_id: string; step: string; summary: string; policy_clause: string | null }[]
}

export async function ledger(api: string): Promise<LedgerState> {
  const response = await fetch(`${api}/api/state`)
  const body: LedgerState = await response.json()
  return body
}

export function poundsFromText(text: string): number | null {
  const match = text.match(/£\s?([\d,]+(?:\.\d{2})?)/)
  return match?.[1] ? Math.round(Number(match[1].replaceAll(',', '')) * 100) : null
}
