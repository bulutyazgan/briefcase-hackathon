import { assert, ledger, openInbox, openInvoicePage, poundsFromText, postSimulatorMessage, stripeCalls, waitForStripeInvoice, type Scenario } from '../support/harness'

export const acmeAutoSend: Scenario = {
  id: 'acme-auto-send',
  title: 'P4: Acme orders 100 leads, under the limit, so the invoice auto-sends without approval',
  async run(context) {
    const { page, api } = context
    await openInbox(page, context.web)
    const text = "Let's go ahead with 100 fintech CFO leads in London."
    await postSimulatorMessage(api, 'Client — Acme Ventures', text)
    await page.getByText(text).first().waitFor()
    const invoice = await waitForStripeInvoice(api)
    await page.getByText(/Invoice created for £/).first().waitFor({ timeout: 30000 })
    await context.shot('auto-sent')
    const state = await ledger(api)
    assert(state.approvals.length === 0, 'Acme under the limit must not need approval')
    await openInvoicePage(page, context.web, invoice.id)
    const title = await page.getByRole('heading', { level: 1 }).innerText()
    const uiPence = poundsFromText(title)
    assert(uiPence !== null && uiPence < 100000, `Acme invoice must be under £1,000, got ${title}`)
    assert(invoice.total_pence === uiPence, 'ledger total must match the UI')
    await context.shot('acme-invoice')
    const log = await context.mockLog()
    assert(stripeCalls(log, 'POST', /^\/v1\/invoices$/).length === 1, 'one Stripe invoice')
  },
}
