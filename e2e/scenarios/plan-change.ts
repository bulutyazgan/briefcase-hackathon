import { assert, ledger, openInbox, postSimulatorMessage, stripeCalls, type Scenario } from '../support/harness'

// P13: Northwind asks for a yearly lead-list plan in the channel; Tally prices it from the
// price list and the remembered 10% (100 x £4 x 12 less 10% = £4,320.00 net), creates the
// Stripe subscription and replies with the plan, the amount and the subscription id.
export const planChange: Scenario = {
  id: 'plan-change',
  title: 'P13: Northwind moves to a yearly lead-list subscription in Stripe',
  async run(context) {
    const { page, api } = context
    await openInbox(page, context.web)
    const ask = 'Can we switch to 100 leads a month, billed yearly?'
    const askId = await postSimulatorMessage(api, 'Client — Northwind Capital', ask)
    await page.getByText(ask).first().waitFor()
    const reply = page.getByText(/£4,320\.00 net per year/).first()
    await reply.waitFor({ timeout: 30000 })
    const replyText = await reply.locator('xpath=ancestor::article').innerText()
    assert(/100 leads a month, billed yearly/.test(replyText), `the reply must name the yearly plan, got: ${replyText}`)
    assert(/Stripe subscription sub_mock_\d+/.test(replyText), `the reply must name the Stripe subscription, got: ${replyText}`)
    assert(/Policy: P13\./.test(replyText), 'the reply must cite P13')
    await context.shot('plan-change-reply')

    const state = await ledger(api)
    assert(state.events.some((event) => event.message_id === askId && event.step === 'plan_change' && event.policy_clause === 'P13'), 'audit trail must record the plan change under P13')
    assert(state.events.some((event) => event.message_id === askId && event.step === 'staff_note'), 'audit trail must record a staff note')
    assert(state.invoices.length === 0, 'a plan change must not create a lead-list invoice')

    const log = await context.mockLog()
    const subscriptions = stripeCalls(log, 'POST', /^\/v1\/subscriptions$/)
    assert(subscriptions.length === 1, `Stripe must receive one POST /v1/subscriptions, got ${subscriptions.length}`)
    const body = new URLSearchParams(subscriptions[0]?.body ?? '')
    assert(body.get('collection_method') === 'send_invoice', 'the subscription must be invoiced, not charged')
    assert(body.get('days_until_due') === '7', 'the subscription invoice must be due in 7 days')
    assert(body.get('metadata[message_id]') === askId, 'the subscription must carry the message id')
    const prices = stripeCalls(log, 'POST', /^\/v1\/prices$/)
    assert(prices.length === 1, `Stripe must receive one POST /v1/prices, got ${prices.length}`)
    assert(new URLSearchParams(prices[0]?.body ?? '').get('unit_amount') === '432000', 'the yearly price must be 432000p net')
  },
}
