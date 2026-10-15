import { approvalCard, assert, ledger, openAudit, openInbox, stripeCalls, waitForStripeInvoice, type Scenario } from '../support/harness'

// Agent-to-agent: Northwind's procurement agent orders under a PO, Tally bills,
// offers an upsell the buyer declines under its budget (B1), and the buyer pays
// the invoice itself (B1–B3). Tally then delivers the lead list.
export const buyerAgent: Scenario = {
  id: 'buyer-agent',
  title: 'B1–B3: the buyer agent orders, declines the upsell, pays, and Tally delivers',
  async run(context) {
    const { page, api } = context
    await openInbox(page, context.web)
    const started = await fetch(`${api}/api/buyer/start`, { method: 'POST' })
    assert(started.status === 201, `POST /api/buyer/start must answer 201, got ${started.status}`)
    await page.getByText(/PO-2026-104: Let's kick off Q4/).first().waitFor()

    const card = approvalCard(page)
    await card.waitFor({ timeout: 30000 })
    await context.shot('buyer-order-approval')
    await card.getByRole('button', { name: 'Approve invoice' }).click()
    const invoice = await waitForStripeInvoice(api)
    await page.getByText(/Invoice created for £1,080\.00/).first().waitFor({ timeout: 30000 })

    await page.getByText(/Add 200 more leads for £800\.00\?/).first().waitFor({ timeout: 30000 })
    await page.getByText(/Declined under B1\./).first().waitFor({ timeout: 30000 })
    await context.shot('upsell-declined')

    const paidLine = page.getByText(/Paid under B1–B3: in_mock_/).first()
    await paidLine.waitFor({ timeout: 45000 })
    const paidText = await paidLine.innerText()
    assert(paidText.includes(invoice.stripe_invoice_id ?? 'missing'), `the buyer must pay ${invoice.stripe_invoice_id}, said: ${paidText}`)
    assert(/£1,080\.00 on PO-2026-104/.test(paidText), `the buyer must pay £1,080.00 on PO-2026-104, said: ${paidText}`)
    await page.getByText('Payment received. Here is the lead list.').first().waitFor({ timeout: 30000 })
    await context.shot('buyer-paid-and-delivered')

    const state = await ledger(api)
    assert(state.invoices.length === 1 && state.invoices[0]?.status === 'paid', 'the ledger must hold one paid invoice')
    const steps = state.events.map((event) => event.step)
    for (const step of ['buyer_order', 'upsell_offer', 'buyer_reject', 'buyer_pay']) assert(steps.includes(step), `audit trail must record ${step}`)
    const log = await context.mockLog()
    assert(stripeCalls(log, 'POST', /^\/v1\/invoices$/).length === 1, 'exactly one Stripe invoice')
    assert(stripeCalls(log, 'POST', /^\/v1\/invoices\/[^/]+\/pay$/).length === 1, 'the buyer pays through Stripe once')

    await openAudit(page, context.web)
    await page.getByText(/Paid in_mock_\S+ for £1,080\.00 under B1–B3\./).first().waitFor()
    await context.shot('audit-trail')
  },
}
