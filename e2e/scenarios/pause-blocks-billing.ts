import { assert, ledger, sendFromSimulator, stripeCalls, waitFor, type Scenario } from '../support/harness'
import { NORTHWIND_ASK } from './northwind-main-story'

export const pauseBlocksBilling: Scenario = {
  id: 'pause-blocks-billing',
  title: 'F1: /pause stops billing until the account owner sends /resume',
  async run(context) {
    const { page, api } = context
    await page.goto(context.web)
    await page.getByRole('heading', { name: 'Client channel' }).waitFor()
    await sendFromSimulator(page, '/pause')
    await page.getByText(/Tally is paused \(F1 kill switch\)\. No billing/).first().waitFor({ timeout: 30000 })
    const control: unknown = await (await fetch(`${api}/api/control`)).json()
    assert(control !== null && typeof control === 'object' && 'paused' in control && control.paused === true, 'GET /api/control must report paused')
    await context.shot('paused')

    await sendFromSimulator(page, NORTHWIND_ASK)
    await page.getByText(/this request was not sourced or billed/).first().waitFor({ timeout: 30000 })
    await context.shot('commitment-held')
    const state = await ledger(api)
    assert(state.invoices.length === 0 && state.approvals.length === 0, 'no invoice or approval while paused')
    const log = await context.mockLog()
    assert(stripeCalls(log, 'POST', /^\/v1\//).length === 0, 'Stripe must receive no writes while paused')
    assert(!log.some((entry) => entry.provider === 'treg'), 'no Treg sourcing while paused')

    // A non-owner cannot resume; the account owner can.
    await page.getByLabel('Send as').selectOption('Account owner')
    await sendFromSimulator(page, '/resume')
    await page.getByText(/Tally resumed by the account owner/).first().waitFor({ timeout: 30000 })
    await waitFor('control to report resumed', async () => {
      const body: unknown = await (await fetch(`${api}/api/control`)).json()
      return body !== null && typeof body === 'object' && 'paused' in body && body.paused === false
    })
    await context.shot('resumed')
  },
}
