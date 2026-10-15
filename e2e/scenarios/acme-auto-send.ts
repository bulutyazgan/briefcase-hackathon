import { assert, ledger, poundsFromText, postSimulatorMessage, stripeCalls, type Scenario } from '../support/harness'

export const acmeAutoSend: Scenario = {
  id: 'acme-auto-send',
  title: 'P4: Acme orders 100 leads, under the limit, so the invoice auto-sends without approval',
  async run(context) {
    const { page, api } = context
    await page.goto(context.web)
    await page.getByRole('heading', { name: 'Client channel' }).waitFor()
    await postSimulatorMessage(api, 'Client — Acme Ventures', "Let's go ahead with 100 fintech CFO leads in London.")
    const invoicesPanel = page.getByRole('region', { name: 'Invoices' })
    const invoiceButton = invoicesPanel.getByRole('button', { name: /in_mock_/ }).first()
    await invoiceButton.waitFor({ timeout: 30000 })
    await context.shot('auto-sent')
    const state = await ledger(api)
    assert(state.approvals.length === 0, 'Acme under the limit must not need approval')
    const uiPence = poundsFromText(await invoiceButton.innerText())
    assert(uiPence !== null && uiPence < 100000, `Acme invoice must be under £1,000, got ${uiPence}`)
    assert(state.invoices[0]?.total_pence === uiPence, 'ledger total must match the UI')
    const log = await context.mockLog()
    assert(stripeCalls(log, 'POST', /^\/v1\/invoices$/).length === 1, 'one Stripe invoice')
  },
}
