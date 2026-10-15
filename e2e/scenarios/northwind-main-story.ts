import { assert, ledger, postSimulatorMessage, poundsFromText, sendFromSimulator, stripeCalls, type Scenario } from '../support/harness'

export const NORTHWIND_ASK = "Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time."

export const northwindMainStory: Scenario = {
  id: 'northwind-main-story',
  title: 'Northwind: commitment → approval → invoice with evidence → hosted pay → delivery → why',
  async run(context) {
    const { page, api } = context
    await page.goto(context.web)
    await page.getByRole('heading', { name: 'Client channel' }).waitFor()
    await context.shot('loaded')

    await sendFromSimulator(page, NORTHWIND_ASK)
    await page.getByText(NORTHWIND_ASK).first().waitFor()
    await context.shot('client-message-sent')

    const approvalCard = page.getByRole('region', { name: 'Invoice approval' })
    await approvalCard.waitFor({ timeout: 30000 })
    await page.getByText(/Approval required for £/).first().waitFor()
    const approvalText = await approvalCard.innerText()
    assert(approvalText.includes('£1080.00') || approvalText.includes('£1,080'), `approval card should show £1,080, got: ${approvalText}`)
    let log = await context.mockLog()
    assert(stripeCalls(log, 'POST', /^\/v1\/invoices$/).length === 0, 'no Stripe invoice may exist before approval (P4)')
    await context.shot('approval-card')

    await approvalCard.getByRole('button', { name: 'Approve invoice' }).click()
    const invoicesPanel = page.getByRole('region', { name: 'Invoices' })
    const invoiceButton = invoicesPanel.getByRole('button', { name: /in_mock_/ })
    await invoiceButton.first().waitFor({ timeout: 30000 })
    const invoiceLabel = await invoiceButton.first().innerText()
    const uiPence = poundsFromText(invoiceLabel)
    assert(uiPence === 108000, `Northwind 300 leads must invoice £1,080.00; UI shows ${invoiceLabel}`)

    // Evidence: quote, memory fact, policy clauses.
    await invoicesPanel.getByText('Evidence for this invoice').waitFor()
    await invoicesPanel.getByText(NORTHWIND_ASK).first().waitFor()
    await invoicesPanel.getByText(/10% off orders over 200 leads/).first().waitFor()
    const clauses = await invoicesPanel.getByLabel('Policy clauses').first().innerText()
    for (const clause of ['P1', 'P3', 'P4']) assert(clauses.includes(clause), `evidence must cite ${clause}; got ${clauses}`)
    await context.shot('invoice-with-evidence')

    const state = await ledger(api)
    const invoice = state.invoices[0]
    assert(state.invoices.length === 1 && invoice !== undefined, `ledger should hold one invoice, has ${state.invoices.length}`)
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
    if (context.isPending('northwind-stripe-total')) {
      context.note(`pending sub-check northwind-stripe-total: Stripe invoice total is ${stripeTotal}, UI ${uiPence}`)
    } else {
      assert(stripeTotal === uiPence, `Stripe invoice total ${stripeTotal} must equal UI ${uiPence}`)
    }

    // Client pays the hosted invoice.
    const hostedHref = await invoicesPanel.getByRole('link', { name: 'Open Stripe invoice' }).getAttribute('href')
    assert(hostedHref !== null && hostedHref.startsWith(context.mock), `hosted invoice URL should point at the mock, got ${hostedHref}`)
    const hosted = await context.browser.newPage()
    await hosted.goto(hostedHref ?? '')
    await hosted.getByRole('button', { name: 'Pay with 4242' }).click()
    await hosted.getByTestId('paid').waitFor()
    await hosted.screenshot({ path: `${context.artifactsDir}/${context.name}/hosted-invoice-paid.png` })
    await hosted.close()

    await page.getByText('Payment received. Here is the lead list.').first().waitFor({ timeout: 30000 })
    await invoicesPanel.getByRole('button', { name: /paid/ }).first().waitFor({ timeout: 10000 })
    await context.shot('paid-and-delivered')

    // The simulator composer starts a new thread per message, and the agent only
    // explains invoices from the same thread, so "Why?" is sent as a thread reply
    // (as Slack would) through the simulator endpoint. Pending sub-check below.
    const thread = state.messages.find((message) => message.id === invoice.message_id)?.thread ?? invoice.message_id
    if (context.isPending('why-from-composer')) {
      await postSimulatorMessage(api, 'Client — Northwind', 'Why £1,080?', thread)
    } else {
      await sendFromSimulator(page, 'Why £1,080?')
    }
    const answer = page.getByText(/This invoice is £1080\.00/).first()
    await answer.waitFor({ timeout: 30000 })
    const answerText = await answer.innerText()
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
