import { approvalCard, assert, openInbox, openInvoicePage, sendFromSimulator, waitForStripeInvoice, type Scenario } from '../support/harness'
import { NORTHWIND_ASK } from './northwind-main-story'

export const tregSourcing: Scenario = {
  id: 'treg-sourcing',
  title: 'P9/P10: approved Northwind order buys leads through Treg within the spend cap',
  async run(context) {
    const { page, api } = context
    await openInbox(page, context.web)
    await sendFromSimulator(page, NORTHWIND_ASK)
    const card = approvalCard(page)
    await card.waitFor({ timeout: 30000 })
    await card.getByRole('button', { name: 'Approve invoice' }).click()
    const invoice = await waitForStripeInvoice(api, 60000)
    await page.getByText(/300 leads are ready/).first().waitFor({ timeout: 30000 })
    await openInvoicePage(page, context.web, invoice.id)
    await page.getByRole('heading', { level: 1, name: /£1,080\.00/ }).waitFor()
    await context.shot('sourced-and-invoiced')
    const log = await context.mockLog()
    const calls = log.filter((entry) => entry.provider === 'treg')
    assert(calls.length > 0, 'Treg must receive /call/ requests')
    for (const call of calls) {
      assert(call.method === 'POST', 'Treg calls are POST')
      assert(call.headers['x-treg-token'] === 'mock', 'Treg calls carry X-Treg-Token')
      assert((call.headers['x-treg-route-max-cost'] ?? '') !== '', 'Treg calls carry X-Treg-Route-Max-Cost (P9)')
      assert(/^\/call\/apollo\./.test(call.path), `Treg endpoint must be allowlisted (P10): ${call.path}`)
    }
    const charged = calls.reduce((sum, call) => sum + Number(call.responseHeaders['x-treg-cost-micro'] ?? 0), 0)
    context.note(`Treg calls: ${calls.length}, charged ${charged} micro-USD`)
  },
}
