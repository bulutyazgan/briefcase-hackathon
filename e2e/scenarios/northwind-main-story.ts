import {
  approvalCard,
  assert,
  ledger,
  openInbox,
  openInvoicePage,
  payOnHostedPage,
  poundsFromText,
  sendFromSimulator,
  stripeCalls,
  stripeInvoiceLink,
  waitForStripeInvoice,
  type Scenario,
} from '../support/harness'

export const NORTHWIND_ASK = "Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time."

export const northwindMainStory: Scenario = {
  id: 'northwind-main-story',
  title: 'Northwind: commitment → approval → invoice with evidence → hosted pay → delivery → why',
  async run(context) {
    const { page, api } = context
    await openInbox(page, context.web)
    await context.shot('loaded')

    await sendFromSimulator(page, NORTHWIND_ASK)
    await page.getByText(NORTHWIND_ASK).first().waitFor()
    await context.shot('client-message-sent')

    const card = approvalCard(page)
    await card.waitFor({ timeout: 30000 })
    await page.getByText(/Approval required for £/).first().waitFor()
    const approvalText = await card.innerText()
    assert(approvalText.includes('£1080.00') || approvalText.includes('£1,080'), `approval card should show £1,080, got: ${approvalText}`)
    let log = await context.mockLog()
    assert(stripeCalls(log, 'POST', /^\/v1\/invoices$/).length === 0, 'no Stripe invoice may exist before approval (P4)')
    await context.shot('approval-card')

    await card.getByRole('button', { name: 'Approve invoice' }).click()
    const invoice = await waitForStripeInvoice(api)
    await page.getByText(/Invoice created for £1,080\.00/).first().waitFor({ timeout: 30000 })
    await context.shot('invoice-created-reply')

    await openInvoicePage(page, context.web, invoice.id)
    const title = await page.getByRole('heading', { level: 1 }).innerText()
    const uiPence = poundsFromText(title)
    assert(uiPence === 108000, `Northwind 300 leads must invoice £1,080.00; page title is ${title}`)
    assert(/awaiting payment/.test(title), `invoice should be open before payment, title is ${title}`)

    // Evidence: quote, memory fact, policy clauses.
    const evidence = page.getByRole('heading', { name: 'Evidence trail' }).locator('xpath=ancestor::section')
    await evidence.getByText(NORTHWIND_ASK).first().waitFor()
    await evidence.getByText(/10% off orders over 200 leads/).first().waitFor()
    await evidence.getByText('300 × £4.00 = £1,200.00 − £120.00 agreed discount = £1,080.00').waitFor()
    for (const clause of ['P1', 'P3', 'P4']) {
      assert(await evidence.getByRole('link', { name: clause, exact: true }).count() === 1, `evidence must cite ${clause}`)
    }
    await context.shot('invoice-with-evidence')

    const state = await ledger(api)
    assert(state.invoices.length === 1, `ledger should hold one invoice, has ${state.invoices.length}`)
    assert(invoice.total_pence === uiPence, 'ledger total must equal the UI total')
    log = await context.mockLog()
    const created = stripeCalls(log, 'POST', /^\/v1\/invoices$/)
    const finalized = stripeCalls(log, 'POST', /^\/v1\/invoices\/[^/]+\/finalize$/)
    const items = stripeCalls(log, 'POST', /^\/v1\/invoiceitems$/)
    assert(created.length === 1, `Stripe should receive exactly one invoice create, got ${created.length}`)
    assert(finalized.length === 1, `Stripe should finalize once, got ${finalized.length}`)
    const itemTotal = items.reduce((sum, entry) => sum + Number(new URLSearchParams(entry.body).get('amount') ?? 0), 0)
    assert(itemTotal === uiPence, `Stripe invoice items sum to ${itemTotal}, UI shows ${uiPence}`)
    assert(created.every((entry) => (entry.headers['idempotency-key'] ?? '').length > 0), 'invoice create must carry an Idempotency-Key')

    const stripeState: unknown = await (await fetch(`${context.mock}/__state`)).json()
    const stripeTotal = readStripeTotal(stripeState, invoice.stripe_invoice_id ?? '')
    // The UI lists the net total; Stripe adds 20% VAT through the tax rate on each item.
    assert(stripeTotal === 129600, `Stripe invoice total must be 129600 (£1,080.00 + £216.00 VAT), got ${stripeTotal}`)

    // Client pays the hosted invoice.
    const hostedHref = await stripeInvoiceLink(page).getAttribute('href')
    assert(hostedHref !== null && hostedHref.startsWith(context.mock), `hosted invoice URL should point at the mock, got ${hostedHref}`)
    await payOnHostedPage(context, hostedHref ?? '')

    await page.getByRole('heading', { level: 1, name: /collected from Northwind/ }).waitFor({ timeout: 30000 })
    await context.shot('invoice-paid')

    await openInbox(page, context.web)
    await page.getByText('Payment received. Here is the lead list.').first().waitFor({ timeout: 30000 })
    await context.shot('paid-and-delivered')

    // The simulator continues the author's latest thread, so the composer's "Why?" lands in the invoice thread.
    await sendFromSimulator(page, 'Why £1,080?')
    const answer = page.getByText(/This invoice is £1,080\.00 net \+ £216\.00 VAT \(20%\) = £1,296\.00/).first()
    await answer.waitFor({ timeout: 30000 })
    const answerText = await answer.locator('xpath=ancestor::article').innerText()
    assert(answerText.includes(invoice.stripe_invoice_id ?? 'missing'), 'the why-answer must cite the Stripe invoice id')
    assert(/P3/.test(answerText) && /P4/.test(answerText), 'the why-answer must cite policy clauses')
    assert(/10% off/.test(answerText), 'the why-answer must cite the memory fact')
    await context.shot('why-answer')

    log = await context.mockLog()
    assert(stripeCalls(log, 'POST', /^\/v1\/invoices$/).length === 1, 'still exactly one Stripe invoice at the end')
    assert(log.some((entry) => entry.provider === 'cognee' && entry.path === '/api/v1/search'), 'Cognee recall should be called')
  },
}

function readStripeTotal(state: unknown, invoiceId: string): number | null {
  if (!state || typeof state !== 'object' || !('invoices' in state) || !Array.isArray(state.invoices)) return null
  for (const entry of state.invoices) {
    if (entry && typeof entry === 'object' && 'id' in entry && entry.id === invoiceId && 'total' in entry) {
      return Number(entry.total)
    }
  }
  return null
}
