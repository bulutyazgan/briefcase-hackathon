import { Database } from 'bun:sqlite'
import { approvalCard, assert, ledger, openInbox, openInvoiceList, sendFromSimulator, stripeCalls, waitFor, waitForStripeInvoice, type Scenario } from '../support/harness'
import { NORTHWIND_ASK } from './northwind-main-story'

// P6: the same commitment message processed twice yields one Stripe invoice.
// Replay is simulated the way a crash/redelivery would look: the message row is
// marked unprocessed again so the agent loop picks it up a second time.
export const replaySafety: Scenario = {
  id: 'replay-safety',
  title: 'P6: one Stripe invoice per commitment message, even when replayed',
  async run(context) {
    const { page, api } = context
    await openInbox(page, context.web)
    await sendFromSimulator(page, NORTHWIND_ASK)
    const card = approvalCard(page)
    await card.waitFor({ timeout: 30000 })
    const approvedAt = new Date().toISOString()
    await card.getByRole('button', { name: 'Approve invoice' }).click()
    await waitForStripeInvoice(api)
    await page.getByText(/Invoice created for £1,080\.00/).first().waitFor({ timeout: 30000 })
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
    const reopened = await card.isVisible()
    if (reopened) {
      await card.getByRole('button', { name: 'Approve invoice' }).click()
      await waitFor('replayed approval to close', async () => !(await card.isVisible()), 30000)
      await Bun.sleep(2500)
    }
    context.note(`replay re-opened approval: ${reopened}`)
    await context.shot('after-replay')

    const final = await ledger(api)
    assert(final.invoices.length === 1, `ledger must hold one invoice after replay, has ${final.invoices.length}`)
    await openInvoiceList(page, context.web)
    const rows = await page.getByRole('table').getByRole('row').count()
    assert(rows === 2, `invoices table must list one invoice (one header row + one row), has ${rows} rows`)
    await context.shot('invoice-list')
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
