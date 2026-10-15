import { assert, ledger, openInbox, openInvoicePage, postSimulatorMessage, stripeCalls, waitForStripeInvoice, type Scenario } from '../support/harness'

// P11: Globex orders 50 leads (under the approval limit, so the invoice auto-sends),
// then disputes 10 of them in the same thread; Tally issues a Stripe credit note.
// Globex is not in the composer's "Send as" list, so both messages go through the
// simulator endpoint, which continues the author's latest thread.
export const globexDispute: Scenario = {
  id: 'globex-dispute',
  title: 'P11: Globex disputes delivered leads and receives a Stripe credit note',
  async run(context) {
    const { page, api } = context
    await openInbox(page, context.web)
    const order = 'Go ahead, order 50 fintech CFO leads in London.'
    const orderId = await postSimulatorMessage(api, 'Client — Globex', order)
    await page.getByText(order).first().waitFor()
    const invoice = await waitForStripeInvoice(api)
    await page.getByText(/Invoice created for £200\.00/).first().waitFor({ timeout: 30000 })
    assert(invoice.total_pence === 20000, `Globex 50 leads must invoice £200.00, ledger has ${invoice.total_pence}p`)
    assert(invoice.message_id === orderId, 'the invoice must belong to the order message')
    await context.shot('globex-invoiced')

    const dispute = 'Only 40 of those leads were valid'
    const disputeId = await postSimulatorMessage(api, 'Client — Globex', dispute)
    await page.getByText(dispute).first().waitFor()
    const reply = page.getByText(/Credit note \S+ issued for £40\.00 against invoice in_mock_/).first()
    await reply.waitFor({ timeout: 30000 })
    const replyText = await reply.locator('xpath=ancestor::article').innerText()
    assert(replyText.includes(invoice.stripe_invoice_id ?? 'missing'), `the credit note must name ${invoice.stripe_invoice_id}`)
    assert(/Credited 10 leads at £4\.00 net per lead\. Policy: P11\./.test(replyText), `the reply must show the credit arithmetic, got: ${replyText}`)
    await context.shot('credit-note-reply')

    const state = await ledger(api)
    const disputeMessage = state.messages.find((message) => message.id === disputeId)
    assert(disputeMessage?.thread === orderId, 'the dispute must land in the order thread')
    assert(state.invoices.length === 1, 'the dispute must not create a second invoice')
    assert(state.events.some((event) => event.message_id === disputeId && event.step === 'credit_issued'), 'audit trail must record the credit note')
    const log = await context.mockLog()
    const creditNotes = stripeCalls(log, 'POST', /^\/v1\/credit_notes$/)
    assert(creditNotes.length === 1, `Stripe must receive one POST /v1/credit_notes, got ${creditNotes.length}`)
    const body = new URLSearchParams(creditNotes[0]?.body ?? '')
    assert(body.get('invoice') === invoice.stripe_invoice_id, `the credit note must reference ${invoice.stripe_invoice_id}`)
    assert((creditNotes[0]?.headers['idempotency-key'] ?? '').length > 0, 'the credit note must carry an Idempotency-Key')
    assert(stripeCalls(log, 'POST', /^\/v1\/invoices$/).length === 1, 'still exactly one Stripe invoice')

    await openInvoicePage(page, context.web, invoice.id)
    await page.getByRole('heading', { level: 1, name: /£200\.00/ }).waitFor()
    await context.shot('globex-invoice')
  },
}
