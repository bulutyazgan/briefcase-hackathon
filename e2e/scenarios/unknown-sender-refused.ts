import { assert, ledger, openInbox, openInvoiceList, postSimulatorMessage, stripeCalls, waitFor, type Scenario } from '../support/harness'

export const unknownSenderRefused: Scenario = {
  id: 'unknown-sender-refused',
  title: 'P5: an unknown sender is refused and nothing reaches Stripe',
  async run(context) {
    const { page, api } = context
    await openInbox(page, context.web)
    const text = "Let's kick off. 300 fintech CFO leads in London please."
    const messageId = await postSimulatorMessage(api, 'Client — Initech Unknown', text)
    await page.getByText(text).first().waitFor()
    await context.shot('unknown-message')

    const replied = await waitFor('agent reply to the unknown sender', async () => {
      const state = await ledger(api)
      return state.messages.find((message) => message.thread === messageId && message.author === 'tally')
    })
    await page.getByText(replied.text.split('\n')[0] ?? replied.text).first().waitFor()
    assert(/could not confirm|will not create|who/i.test(replied.text), `expected a refusal, got: ${replied.text}`)
    await context.shot('refused')

    const state = await ledger(api)
    assert(state.invoices.length === 0, 'no invoice may be created for an unknown sender')
    assert(state.approvals.length === 0, 'no approval may be requested for an unknown sender')
    const decide = state.events.find((event) => event.message_id === messageId && event.step === 'decide')
    assert(decide !== undefined, 'a decide event must be recorded')
    await openInvoiceList(page, context.web)
    await page.getByText('No invoices have been created yet.').waitFor()
    await context.shot('invoices-empty')
    const log = await context.mockLog()
    assert(stripeCalls(log, 'POST', /^\/v1\//).length === 0, 'Stripe must receive no writes')
  },
}
