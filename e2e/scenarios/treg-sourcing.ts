import { assert, sendFromSimulator, type Scenario } from '../support/harness'
import { NORTHWIND_ASK } from './northwind-main-story'

export const tregSourcing: Scenario = {
  id: 'treg-sourcing',
  title: 'P9/P10: approved Northwind order buys leads through Treg within the spend cap',
  async run(context) {
    const { page } = context
    await page.goto(context.web)
    await page.getByRole('heading', { name: 'Client channel' }).waitFor()
    await sendFromSimulator(page, NORTHWIND_ASK)
    const approvalCard = page.getByRole('region', { name: 'Invoice approval' })
    await approvalCard.waitFor({ timeout: 30000 })
    await approvalCard.getByRole('button', { name: 'Approve invoice' }).click()
    await page.getByRole('region', { name: 'Invoices' }).getByRole('button', { name: /in_mock_/ }).first().waitFor({ timeout: 45000 })
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
