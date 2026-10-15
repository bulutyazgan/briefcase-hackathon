import { Database } from 'bun:sqlite'
import { assert, ledger, sendFromSimulator, stripeCalls, waitFor, type Scenario } from '../support/harness'
import { NORTHWIND_ASK } from './northwind-main-story'

// P6: the same commitment message processed twice yields one Stripe invoice.
// Replay is simulated the way a crash/redelivery would look: the message row is
// marked unprocessed again so the agent loop picks it up a second time.
export const replaySafety: Scenario = {
  id: 'replay-safety',
  title: 'P6: one Stripe invoice per commitment message, even when replayed',
  async run(context) {
    const { page, api } = context
    await page.goto(context.web)
    await page.getByRole('heading', { name: 'Client channel' }).waitFor()
    await sendFromSimulator(page, NORTHWIND_ASK)
    const approvalCard = page.getByRole('region', { name: 'Invoice approval' })
    await approvalCard.waitFor({ timeout: 30000 })
    const approvedAt = new Date().toISOString()
    await approvalCard.getByRole('button', { name: 'Approve invoice' }).click()
    const invoicesPanel = page.getByRole('region', { name: 'Invoices' })
    await invoicesPanel.getByRole('button', { name: /in_mock_/ }).first().waitFor({ timeout: 30000 })
    await context.shot('first-pass-invoiced')

    const first = await ledger(api)
    const message = first.messages.find((entry) => entry.text === NORTHWIND_ASK)
    assert(message !== undefined, 'the commitment message must be in the ledger')
    const messageId = message?.id ?? ''

    // A second approval POST for the same message is refused.
    const again = await fetch(`${api}/api/approvals/${messageId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    assert(again.status === 409, `a second approval must be refused with 409, got ${again.status}`)

    // Replay only once the approval pass has finished: the invoice shows before that pass marks the
    // message processed again, and a reset made before that mark is overwritten by it.
    await waitFor('the approval pass to mark the message processed', async () => {
      const state = await ledger(api)
      const row = state.messages.find((entry) => entry.id === messageId)
      return row !== undefined && row.processed_at !== null && row.processed_at > approvedAt
    }, 60000)
    const database = new Database(context.dbPath)
    database.exec('PRAGMA busy_timeout = 15000')
    const resetAt = new Date().toISOString()
    database.query('UPDATE messages SET processed_at = NULL WHERE id = ?').run(messageId)
    database.close()
    // A fresh processed_at proves the second pass ran; the event list is capped, so its length cannot.
    await waitFor('the replayed message to be processed again', async () => {
      const state = await ledger(api)
      const row = state.messages.find((entry) => entry.id === messageId)
      return row !== undefined && row.processed_at !== null && row.processed_at > resetAt
    })
    await context.shot('replayed')

    // If the replay re-opened the approval, approve it again like a user would.
    await Bun.sleep(2000)
    const reopened = await approvalCard.isVisible()
    if (reopened) {
      await approvalCard.getByRole('button', { name: 'Approve invoice' }).click()
      await waitFor('replayed approval to close', async () => !(await approvalCard.isVisible()), 30000)
      await Bun.sleep(2500)
    }
    context.note(`replay re-opened approval: ${reopened}`)
    await context.shot('after-replay')

    const final = await ledger(api)
    assert(final.invoices.length === 1, `ledger must hold one invoice after replay, has ${final.invoices.length}`)
    assert(await invoicesPanel.getByRole('button', { name: /in_mock_/ }).count() === 1, 'invoices view must list one invoice')
    const log = await context.mockLog()
    const created = stripeCalls(log, 'POST', /^\/v1\/invoices$/)
    const ids = new Set(created.map((entry) => entry.headers['idempotency-key']))
    assert(created.length <= 2 && ids.size === 1, `Stripe invoice creates must share one Idempotency-Key (got ${created.length} calls, ${ids.size} keys)`)
    const stripeState: unknown = await (await fetch(`${context.mock}/__state`)).json()
    const count = stripeState && typeof stripeState === 'object' && 'invoices' in stripeState && Array.isArray(stripeState.invoices)
      ? stripeState.invoices.length
      : -1
    assert(count === 1, `Stripe must hold exactly one invoice, holds ${count}`)
  },
}
