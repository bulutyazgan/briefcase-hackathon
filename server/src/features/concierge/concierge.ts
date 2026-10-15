import { generateText, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { getSetting, getState, recordEvent, saveInvoice, setSetting, updateInvoice, type ChannelMessage } from '../ledger/store'
import { getStripe } from '../billing/billing'
import { reply } from '../channels/channel'
import { sendTelegramPdf } from '../channels/telegram'
import { findClient, type Client } from '../clients/clients'
import { recallFacts, recallSeededFacts, searchCogneeDataset } from '../memory/memory'
import { readCompanyKnowledge } from '../company/company'
import { renderInvoicePdf } from '../invoice-pdf/render'

// Customer-service conversation. The LLM writes the reply and extracts a plan
// change request; code checks P5/P8 and the rate card, then bills.

const PLAN = { label: 'Website care plan', monthlyPence: 50000, yearlyPence: 500000 } as const

const outputSchema = z.object({
  reply: z.string(),
  quote: z.string(),
  planChange: z.enum(['yearly', 'monthly']).nullable(),
})

export function wantsPlanChange(text: string): boolean {
  return /\b(yearly|annual|annually|monthly)\b/i.test(text)
}

function step(message: ChannelMessage, name: string, summary: string, data: unknown, clauses: string[] = []): void {
  recordEvent({ id: crypto.randomUUID(), message_id: message.id, step: name, summary, data_json: JSON.stringify(data), policy_clause: clauses.join(',') || null })
}

function pounds(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
}

function resolveClient(message: ChannelMessage): Client | null {
  return findClient(message.text) ?? findClient(message.author)
}

async function billYearly(message: ChannelMessage, client: Client, quote: string, fact: string): Promise<string> {
  const stripe = getStripe()
  const customer = (await stripe.customers.list({ email: client.billingEmail, limit: 1 })).data[0]
    ?? await stripe.customers.create({ name: client.name, email: client.billingEmail, metadata: { tally_client: client.name } })
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    currency: 'gbp',
    collection_method: 'send_invoice',
    days_until_due: 7,
    auto_advance: false,
    metadata: { message_id: message.id, client: client.name, plan: 'care-yearly', decision_clauses: 'P2,P5,P8' },
  }, { idempotencyKey: `plan-invoice-${message.id}` })
  await stripe.invoiceItems.create({
    customer: customer.id,
    invoice: invoice.id,
    amount: PLAN.yearlyPence,
    currency: 'gbp',
    description: `${PLAN.label}, yearly (was ${pounds(PLAN.monthlyPence)} per month)`,
  }, { idempotencyKey: `plan-item-${message.id}` })
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id, {}, { idempotencyKey: `plan-finalize-${message.id}` })
  await stripe.invoices.sendInvoice(finalized.id, {}, { idempotencyKey: `plan-send-${message.id}` }).catch((error: unknown) => console.error(`Stripe email failed: ${String(error)}`))
  const hostedUrl = finalized.hosted_invoice_url ?? ''
  saveInvoice({ id: message.id, message_id: message.id, stripe_invoice_id: finalized.id, client_id: customer.id, total_pence: PLAN.yearlyPence, status: finalized.status ?? 'open', hosted_url: hostedUrl, pdf_path: null })
  setSetting(`plan:${client.name}`, 'yearly')
  step(message, 'plan_change', `${client.name} moved the ${PLAN.label.toLowerCase()} from monthly to yearly (${pounds(PLAN.yearlyPence)}/year).`, { from: 'monthly', to: 'yearly', stripeInvoiceId: finalized.id, quote }, ['P2', 'P5', 'P8'])
  try {
    const pdfPath = await renderInvoicePdf({
      invoiceId: message.id,
      issuedAt: new Date(),
      dueInDays: 7,
      client: { name: client.name, email: client.billingEmail },
      totalPence: PLAN.yearlyPence,
      lines: [{ description: `${PLAN.label}, yearly`, quantity: 1, unitPricePence: PLAN.yearlyPence, totalPence: PLAN.yearlyPence, quote, memoryFact: fact, clauses: ['P2', 'P5', 'P8'] }],
      paymentUrl: hostedUrl || undefined,
      stripeInvoiceId: finalized.id,
    })
    updateInvoice(message.id, finalized.status ?? 'open', undefined, pdfPath)
    await sendTelegramPdf(message, pdfPath, `Invoice ${finalized.id} for ${pounds(PLAN.yearlyPence)}`).catch((error: unknown) => console.error(`Telegram PDF failed: ${String(error)}`))
  } catch (error) {
    console.error(`Plan PDF failed: ${String(error)}`)
  }
  step(message, 'staff_note', `${client.name} switched the ${PLAN.label.toLowerCase()} from monthly to yearly in chat. Invoice ${finalized.id} for ${pounds(PLAN.yearlyPence)} sent to ${client.billingEmail}. No action needed.`, { stripeInvoiceId: finalized.id }, ['P8'])
  return `Invoice ${finalized.id}: ${pounds(PLAN.yearlyPence)} for 12 months, due in 7 days. You save ${pounds(PLAN.monthlyPence * 12 - PLAN.yearlyPence)} a year.\nPay here: ${hostedUrl}`
}

export async function converse(message: ChannelMessage): Promise<void> {
  const client = resolveClient(message)
  const currentPlan = client ? getSetting(`plan:${client.name}`) ?? 'monthly' : null
  const facts = client
    ? await recallFacts(client.name, message.text).catch(() => recallSeededFacts(client.name))
    : []
  const cogneeHits = await searchCogneeDataset('company', message.text, { topK: 5, timeoutMs: 4000 })
    .catch(() => null) ?? []
  if (client) step(message, 'client_identified', `Found ${client.name} in the CRM (${PLAN.label.toLowerCase()}, ${currentPlan}).`, { client: client.name, plan: currentPlan, facts }, ['P5'])
  const history = getState().messages.filter((entry) => entry.channel === message.channel && entry.id !== message.id).slice(-10)
  const apiKey = process.env.OPENAI_API_KEY
  let output: z.infer<typeof outputSchema> = { reply: 'Thanks. How can I help with your account today?', quote: '', planChange: null }
  if (apiKey) {
    const modelId = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'
    try {
      const result = await generateText({
        model: createOpenAI({ apiKey })(modelId),
        output: Output.object({ schema: outputSchema }),
        prompt: [
          'You are Tally, the customer-service and billing agent for the company below. Reply in 2-4 short sentences, friendly, plain English.',
          'Sell and answer only from the company knowledge. Never invent prices.',
          client
            ? `This client is in the CRM: ${client.name}. Current care plan billing: ${currentPlan}. Greet them by name and say you found them.`
            : 'This person is not in the CRM yet. Learn what they need and offer a fitting service with its price band. Ask for their company name and billing email.',
          'Set planChange only if the client explicitly asks to switch the care plan billing to yearly or monthly. If yearly, say you have noted the change and that the invoice follows below; do not write a link.',
          'quote must be the exact words from the client message that state the request, or empty.',
          `Company knowledge:\n${readCompanyKnowledge()}`,
          `Cognee company context:\n${cogneeHits.join('\n') || '- none'}`,
          `Client memory:\n${facts.map((fact) => `- ${fact.date}: ${fact.fact}`).join('\n') || '- none'}`,
          `Recent conversation:\n${history.map((entry) => `${entry.author}: ${entry.text}`).join('\n') || '(new conversation)'}`,
          `Client message from ${message.author}: ${message.text}`,
        ].join('\n\n'),
      })
      output = result.output
    } catch (error) {
      console.error(`Concierge failed: ${String(error)}`)
    }
  }
  const quote = output.quote && message.text.includes(output.quote) ? output.quote : message.text
  step(message, 'converse', 'Answered the client in chat.', {
    reply: output.reply,
    planChange: output.planChange,
    client: client?.name ?? null,
    cogneeHits,
  })
  let text = output.reply
  if (output.planChange === 'yearly') {
    if (!client) text = `${text}\n\nI could not find your account yet. Tell me your name or company and I will switch it straight away (P5).`
    else if (currentPlan === 'yearly') text = `${text}\n\nYou are already on yearly billing, so nothing changes (P8).`
    else {
      try {
        text = `${text}\n\n${await billYearly(message, client, quote, facts[0]?.fact ?? `${client.name} is on the ${PLAN.label.toLowerCase()}`)}`
      } catch (error) {
        step(message, 'plan_change', 'Plan change billing failed.', { error: String(error) }, ['P8'])
        text = `${text}\n\nI noted the change, but billing failed, so a colleague will send the invoice.`
      }
    }
  }
  await reply(message, text)
}
