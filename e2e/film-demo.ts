// Films the six-beat "Said, done, billed" demo as a video against a stack started by
// e2e/stack.ts (seeded with `bun run demo:seed` semantics by support/stack.ts).
// Every beat is paced like a two-minute product video, saves a keyframe PNG, and never
// aborts the recording: a beat that fails is logged in beats.json and the next one runs.
//
//   bun e2e/stack.ts &                       # wait for TALLY STACK READY
//   bun e2e/film-demo.ts [out-dir]           # default e2e/artifacts/film
//
// Ports come from MOCK_PORT, E2E_API_PORT and E2E_WEB_PORT (support/stack.ts).
// Output: <out-dir>/tally-demo.webm, <out-dir>/tally-demo.mp4 (when ffmpeg is
// installed), <out-dir>/NN-<beat>.png keyframes and <out-dir>/beats.json.
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Locator } from 'playwright'
import { approvalCard, ledger, openInbox, openInvoicePage, postSimulatorMessage, stripeInvoiceLink, waitFor } from './support/harness'
import { apiBase, artifactsDir, chromePath, webBase } from './support/stack'

const INITECH = 'Client — Initech'
const NORTHWIND = 'Client — Northwind'
const GLOBEX = 'Client — Globex'
const OWNER = 'Account owner'

const INITECH_INQUIRY = "Hi, we're Initech. What do you charge for lead lists? We'd need around 300 fintech CFO leads in London."
const INITECH_COMMIT = "Let's do 300. Fintech CFOs in London. Send invoices to ap@initech.example."
const PLAN_CHANGE = 'Can we switch to 100 leads a month, billed yearly?'
const GLOBEX_DISPUTE = 'Only 40 of those leads were valid.'
const WHY = 'Why £1,080?'

const BEAT_PAUSE_MS = 2000
const FRAME = { width: 1440, height: 900 }

const outDir = process.argv[2] ?? join(artifactsDir, 'film')
await mkdir(outDir, { recursive: true })

interface BeatResult {
  beat: string
  ok: boolean
  seconds: number
  error?: string
}

const results: BeatResult[] = []
const startedAt = Date.now()

const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) })
const context = await browser.newContext({ viewport: FRAME, recordVideo: { dir: outDir, size: FRAME } })
const page = await context.newPage()
page.setDefaultTimeout(30000)

const pause = (ms = BEAT_PAUSE_MS) => page.waitForTimeout(ms)

async function keyframe(name: string): Promise<void> {
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false })
}

async function beat(name: string, run: () => Promise<void>): Promise<void> {
  const t0 = Date.now()
  try {
    await run()
    results.push({ beat: name, ok: true, seconds: (Date.now() - t0) / 1000 })
    console.info(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  } catch (error) {
    results.push({ beat: name, ok: false, seconds: (Date.now() - t0) / 1000, error: String(error) })
    console.error(`FAIL ${name}: ${String(error)}`)
  }
  await keyframe(name).catch(() => undefined)
  await pause()
}

async function showElement(target: Locator): Promise<void> {
  await target.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  await pause(1000)
}

// Types into the inbox composer as the chosen author, like a person on camera would.
async function typeAndSend(author: string, text: string): Promise<void> {
  await page.getByLabel('Send as').selectOption(author)
  const composer = page.getByLabel('Message')
  await showElement(composer)
  await composer.click()
  await composer.pressSequentially(text, { delay: 15 })
  await pause(500)
  await page.getByRole('button', { name: 'Send' }).click()
}

async function approveNext(timeoutMs = 45000): Promise<void> {
  const card = approvalCard(page)
  await card.waitFor({ timeout: timeoutMs })
  await showElement(card)
  await card.getByRole('button', { name: 'Approve invoice' }).click()
}

async function showInvoiceWithEvidence(invoiceId: string, keyframeName: string): Promise<void> {
  await openInvoicePage(page, webBase, invoiceId)
  await stripeInvoiceLink(page).first().waitFor({ timeout: 30000 })
  await showElement(page.getByRole('heading', { name: 'Evidence trail' }))
  await keyframe(keyframeName)
}

async function payNewestInvoice(): Promise<void> {
  const invoice = (await ledger(apiBase)).invoices.find((row) => row.hosted_url && row.status === 'open')
  if (!invoice?.hosted_url) throw new Error('No open hosted invoice to pay.')
  const hosted = await context.newPage()
  await hosted.goto(invoice.hosted_url)
  await hosted.waitForTimeout(1200)
  await hosted.getByRole('button', { name: 'Pay with 4242' }).click()
  await hosted.getByTestId('paid').waitFor()
  await hosted.screenshot({ path: join(outDir, '02c-hosted-paid.png') })
  await hosted.waitForTimeout(1200)
  const hostedVideo = hosted.video()
  await hosted.close()
  await hostedVideo?.delete()
  await page.bringToFront()
}

try {
  await beat('01-hook', async () => {
    // The landing page streams the demo video, so the load event lags; DOM ready is enough for the hook.
    await page.goto(webBase, { waitUntil: 'domcontentloaded' })
    await pause(1500)
    await openInbox(page, webBase)
    await pause(1000)
  })

  await beat('02-intake-initech', async () => {
    await openInbox(page, webBase)
    const before = (await ledger(apiBase)).messages.length
    await typeAndSend(INITECH, INITECH_INQUIRY)
    const answer = await waitFor('the company-knowledge answer to Initech', async () => {
      const state = await ledger(apiBase)
      const inquiry = state.messages.find((message) => message.author === INITECH && message.text === INITECH_INQUIRY)
      return state.messages.length > before && inquiry
        ? state.messages.find((message) => message.thread === inquiry.thread && message.author === 'tally')
        : null
    }, 45000)
    await showElement(page.getByText(answer.text.split('\n')[0] ?? answer.text).first())
    await keyframe('02a-intake-answer')
    await typeAndSend(INITECH, INITECH_COMMIT)
    await approveNext(60000)
    const invoice = await waitFor('the Initech invoice', async () => {
      const state = await ledger(apiBase)
      const commit = state.messages.find((message) => message.author === INITECH && message.text === INITECH_COMMIT)
      return state.invoices.find((row) => row.message_id === commit?.id && row.hosted_url)
    }, 60000)
    await showElement(page.getByText(/Invoice created for £/).first())
    await keyframe('02b-intake-invoiced')
    await showInvoiceWithEvidence(invoice.id, '02d-intake-evidence')
  })

  await beat('03-proactive-northwind', async () => {
    await openInbox(page, webBase)
    const offer = page.getByText(/Offer:|Offer \S+ /).first()
    await offer.waitFor({ timeout: 45000 })
    await showElement(offer)
    await keyframe('03a-offer')
    await page.getByRole('button', { name: 'Start buyer agent' }).click()
    const order = page.getByText(/^PO-\d{4}-\d+:/).first()
    await order.waitFor({ timeout: 20000 })
    await showElement(order)
    await keyframe('03b-buyer-order')
    await approveNext(45000)
    const paid = page.getByText(/Paid under B1–B3/).first()
    await paid.waitFor({ timeout: 60000 })
    await showElement(paid)
  })

  await beat('04-plan-change', async () => {
    await openInbox(page, webBase)
    await typeAndSend(NORTHWIND, PLAN_CHANGE)
    // Only Tally's P13 reply names the yearly net; the client's own words must not satisfy this beat.
    const reply = page.getByText(/£4,320\.00 net per year/).first()
    await reply.waitFor({ timeout: 30000 })
    await showElement(reply)
  })

  await beat('05-globex-late-and-dispute', async () => {
    await openInbox(page, webBase)
    // The seed billed Globex's order 10 days ago; the collections tick (every 60 s) chases it.
    const state = await ledger(apiBase)
    const order = state.messages.find((message) => message.author === GLOBEX)
    const seeded = state.invoices.find((row) => row.message_id === order?.id && row.status === 'open')
    if (!order || !seeded) throw new Error('No seeded open Globex invoice; start the stack with E2E_SEED=demo.')
    const reminder = page.getByText(/Friendly reminder: invoice/).first()
    await reminder.waitFor({ timeout: 75000 })
    await showElement(reminder)
    await keyframe('05a-reminder')
    await postSimulatorMessage(apiBase, GLOBEX, GLOBEX_DISPUTE, order.thread)
    const credit = page.getByText(/Credit note \S+ issued for £40\.00/).first()
    await credit.waitFor({ timeout: 30000 })
    await showElement(credit)
  })

  await beat('06a-why', async () => {
    await openInbox(page, webBase)
    // The composer continues the author's latest thread, which after beat 4 is the plan-change thread,
    // so the question goes into the £1,080 invoice's thread the way a Slack reply would.
    const state = await ledger(apiBase)
    const invoice = state.invoices.find((row) => row.total_pence === 108000) ?? state.invoices[0]
    const thread = state.messages.find((message) => message.id === invoice?.message_id)?.thread
    if (!thread) throw new Error('No £1,080 invoice thread to ask about.')
    await postSimulatorMessage(apiBase, NORTHWIND, WHY, thread)
    // The agent loop is serial, so the answer waits behind whatever message it is still on.
    const answer = page.getByText(/This invoice is £/).first()
    await answer.waitFor({ timeout: 60000 })
    await showElement(answer)
  })

  await beat('06b-books', async () => {
    await page.goto(`${webBase}/app/books`)
    await page.getByText('Journals post when an invoice is finalised').waitFor({ timeout: 15000 })
    await pause(1500)
  })

  await beat('06c-pause', async () => {
    await openInbox(page, webBase)
    await typeAndSend(OWNER, '/pause')
    const paused = page.getByText(/Tally is paused/).first()
    await paused.waitFor({ timeout: 15000 })
    await showElement(paused)
  })
  await pause(1500)
} finally {
  const video = page.video()
  await context.close()
  const webm = join(outDir, 'tally-demo.webm')
  if (video) {
    await video.saveAs(webm)
    await video.delete()
  }
  await browser.close()
  const mp4 = join(outDir, 'tally-demo.mp4')
  const ffmpeg = Bun.spawn(['ffmpeg', '-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4], { stdout: 'ignore', stderr: 'inherit' })
  const converted = (await ffmpeg.exited.catch(() => 1)) === 0
  const summary = { durationSeconds: (Date.now() - startedAt) / 1000, beats: results, video: webm, mp4: converted ? mp4 : null }
  await Bun.write(join(outDir, 'beats.json'), JSON.stringify(summary, null, 2))
  console.info(JSON.stringify(summary, null, 2))
}
