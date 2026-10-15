import { generateText, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type Stripe from 'stripe'
import { z } from 'zod'
import {
  getEvent,
  getMessage,
  markMessageProcessed,
  recordEvent,
  saveApproval,
  updateApproval,
  type ChannelMessage,
} from '../ledger/store'
import { BillingBlockedError, getStripe } from '../billing/billing'
import { reply } from '../channels/channel'
import { findClient, type Client } from '../clients/clients'
import { blockIfPaused } from '../control/control'
import { recall, recallSeededFacts, remember, type MemoryRole } from '../memory/memory'
import type { MemoryFact } from '../policy/decide'
import { extractDiscountTerms, type DiscountTerms } from '../pricing/discount'
import {
  DEFAULT_PLAN,
  PLAN_CATALOGUE,
  PRODUCT_NAME,
  describePlan,
  findPlan,
  money,
  planIntervals,
  quotePlan,
  type PlanInterval,
  type PlanQuote,
} from './catalogue'

// P13: plan changes up to £12,000 net a year apply automatically; above that the account owner approves.
export const AUTO_PLAN_LIMIT_PENCE = 1_200_000

const planChangeSchema = z.object({
  isPlanChange: z.boolean(),
  leadsPerMonth: z.number().int().nullable(),
  interval: z.enum(planIntervals).nullable(),
  quote: z.string(),
})
export type PlanChange = z.infer<typeof planChangeSchema>

const planQuoteSchema = z.object({
  planId: z.string(),
  leadsPerMonth: z.number(),
  interval: z.enum(planIntervals),
  months: z.number(),
  clientName: z.string(),
  pricePerLeadPence: z.number(),
  leads: z.number(),
  listPence: z.number(),
  discountPercent: z.number(),
  discountFact: z.string(),
  unitAmountPence: z.number(),
  annualValuePence: z.number(),
})
const savedPlanDecisionSchema = z.object({
  outcome: z.enum(['auto', 'needs_approval', 'refuse']),
  reason: z.string(),
  clientName: z.string(),
  quote: z.string(),
  previousPlan: z.string(),
  plan: planQuoteSchema.nullable(),
})
export type PlanDecision = z.infer<typeof savedPlanDecisionSchema>

export interface SubscriptionResult {
  customerId: string
  productId: string
  priceId: string
  subscriptionId: string
  action: 'created' | 'updated' | 'unchanged'
  nextInvoiceDate: string | null
}

export interface SubscriptionGateway {
  subscribe(client: Client, quote: PlanQuote, messageId: string): Promise<SubscriptionResult>
}

export interface PlanChangeDeps {
  findClient(author: string): Client | null
  extract(message: ChannelMessage): Promise<{ change: PlanChange; model: string }>
  recall(clientName: string): Promise<MemoryFact[]>
  discount(facts: MemoryFact[]): Promise<{ terms: DiscountTerms | null; model: string }>
  gateway: SubscriptionGateway
  remember(clientName: string, role: MemoryRole, fact: string, sourceMessageId: string): Promise<unknown>
  reply(message: ChannelMessage, text: string): Promise<void>
}

const DECIDE_STEP = 'plan_decide'
const CHANGE_STEP = 'plan_change'

// Cheap gate so the extractor only runs on messages that talk about a plan or a billing cadence.
export const PLAN_WORDS = /\b(month|monthly|year|yearly|annual|annually|subscription|plan|billed)\b/i
const YEARLY = /\b(yearly|annually|annual|per year|a year|per annum)\b/i
const MONTHLY = /\b(monthly|per month|a month|each month|every month)\b/i
const LEADS_PER_MONTH = /(\d{1,5})\s+leads?\s+(?:a|per|each|every)\s+month/i
const CHANGE = /\b(switch|move|change|upgrade|downgrade|put us|sign us up|subscribe|go (?:yearly|monthly|annual))\b/i
const PLAN_FACT = /Subscription plan: (\d+ leads a month, billed (?:monthly|yearly))/i

function recordStep(messageId: string, step: string, summary: string, data: unknown, clauses: string[]): void {
  recordEvent({
    id: crypto.randomUUID(),
    message_id: messageId,
    step,
    summary,
    data_json: JSON.stringify(data) ?? 'null',
    policy_clause: clauses.length ? clauses.join(',') : null,
  })
}

export function heuristicPlanChange(message: ChannelMessage): PlanChange {
  const text = message.text
  // "100 leads a month, billed yearly" names the cadence twice: the billing interval wins.
  const interval: PlanInterval | null = YEARLY.test(text) ? 'year' : MONTHLY.test(text) ? 'month' : null
  const leadsMatch = text.match(LEADS_PER_MONTH)
  return {
    isPlanChange: message.author !== 'tally' && interval !== null && CHANGE.test(text),
    leadsPerMonth: leadsMatch?.[1] ? Number(leadsMatch[1]) : null,
    interval,
    quote: text,
  }
}

async function extractPlanChange(message: ChannelMessage): Promise<{ change: PlanChange; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { change: heuristicPlanChange(message), model: 'local-fallback' }
  const modelId = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'
  const prompt = [
    'Decide whether this client message asks to start or change a lead-list subscription plan.',
    'leadsPerMonth: the number of leads per month they ask for, or null if not stated.',
    'interval: "month" or "year" for how they want to be billed, or null if not stated. "billed yearly" means year.',
    'The quote must be an exact substring of the message. Do not invent numbers.',
    `Message author: ${message.author}`,
    `Message: ${message.text}`,
  ].join('\n')
  try {
    const { output } = await generateText({
      model: createOpenAI({ apiKey })(modelId),
      output: Output.object({ schema: planChangeSchema }),
      prompt,
    })
    return { change: output, model: modelId }
  } catch (error) {
    console.warn(`Plan extraction failed for ${modelId}: ${String(error)}`)
    return { change: heuristicPlanChange(message), model: 'local-fallback-after-model-error' }
  }
}

export function rememberedPlan(facts: MemoryFact[]): string {
  const latest = facts
    .filter((entry) => PLAN_FACT.test(entry.fact))
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  return latest?.fact.match(PLAN_FACT)?.[1] ?? 'no subscription'
}

export function decidePlanChange(input: {
  client: Client
  change: PlanChange
  discount: DiscountTerms | null
  facts: MemoryFact[]
  previousPlan: string
}): PlanDecision {
  const { client, change } = input
  const base = { clientName: client.name, quote: change.quote, previousPlan: input.previousPlan, plan: null }
  if (!change.interval) {
    return { ...base, outcome: 'refuse', reason: 'The message does not say whether billing is monthly or yearly.' }
  }
  const plan = change.leadsPerMonth === null ? DEFAULT_PLAN : findPlan(change.leadsPerMonth)
  if (!plan) {
    const catalogue = PLAN_CATALOGUE.map((entry) => `${entry.leadsPerMonth} leads a month`).join(', ')
    return { ...base, outcome: 'refuse', reason: `${change.leadsPerMonth} leads a month is not in the catalogue (P13). Available: ${catalogue}.` }
  }
  const quote = quotePlan(plan, change.interval, client, input.discount, input.facts)
  if (quote.annualValuePence > AUTO_PLAN_LIMIT_PENCE) {
    return { ...base, plan: quote, outcome: 'needs_approval', reason: `${money(quote.annualValuePence)} a year exceeds the ${money(AUTO_PLAN_LIMIT_PENCE)} auto limit (P13).` }
  }
  return { ...base, plan: quote, outcome: 'auto', reason: `${money(quote.annualValuePence)} a year is within the ${money(AUTO_PLAN_LIMIT_PENCE)} auto limit (P13).` }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function productIdOf(price: Stripe.Price): string {
  return typeof price.product === 'string' ? price.product : price.product.id
}

// Converges on one lead-list subscription per customer: find before create, update only when the price differs.
export function stripeSubscriptionGateway(): SubscriptionGateway {
  return {
    async subscribe(client, quote, messageId) {
      const stripe = getStripe()
      const email = client.billingEmail
      const customer = (await stripe.customers.list({ email, limit: 1 })).data[0]
        ?? await stripe.customers.create({ name: client.name, email, metadata: { tally_client: client.name } }, { idempotencyKey: `customer-${messageId}` })

      const products = await stripe.products.list({ active: true, limit: 100 })
      const product = products.data.find((entry) => entry.name === PRODUCT_NAME)
        ?? await stripe.products.create({ name: PRODUCT_NAME, metadata: { tally: 'lead-list' } }, { idempotencyKey: 'tally-product-lead-list' })

      const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 })
      const price = prices.data.find((entry) =>
        entry.currency === 'gbp'
        && entry.recurring?.interval === quote.interval
        && entry.unit_amount === quote.unitAmountPence
        && entry.metadata.client === client.name,
      ) ?? await stripe.prices.create({
        product: product.id,
        currency: 'gbp',
        unit_amount: quote.unitAmountPence,
        recurring: { interval: quote.interval },
        nickname: `${client.name}: ${describePlan(quote)}`,
        metadata: { client: client.name, leads_per_month: String(quote.leadsPerMonth), discount_percent: String(quote.discountPercent) },
      }, { idempotencyKey: `price-${slug(client.name)}-${quote.interval}-${quote.unitAmountPence}` })

      const active = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 20 })
      const current = active.data.find((entry) => entry.items.data.some((item) => productIdOf(item.price) === product.id))
      const item = current?.items.data.find((entry) => productIdOf(entry.price) === product.id)
      const metadata = { message_id: messageId, client: client.name, tally_plan: quote.planId }
      let subscription: Stripe.Subscription
      let action: SubscriptionResult['action']
      if (current && item && item.price.id === price.id) {
        subscription = current
        action = 'unchanged'
      } else if (current && item) {
        subscription = await stripe.subscriptions.update(current.id, {
          items: [{ id: item.id, price: price.id }],
          proration_behavior: 'create_prorations',
          collection_method: 'send_invoice',
          days_until_due: 7,
          metadata,
        }, { idempotencyKey: `subscription-update-${messageId}` })
        action = 'updated'
      } else {
        subscription = await stripe.subscriptions.create({
          customer: customer.id,
          items: [{ price: price.id }],
          collection_method: 'send_invoice',
          days_until_due: 7,
          metadata,
        }, { idempotencyKey: `subscription-${messageId}` })
        action = 'created'
      }
      const periodEnd = subscription.items.data[0]?.current_period_end
      return {
        customerId: customer.id,
        productId: product.id,
        priceId: price.id,
        subscriptionId: subscription.id,
        action,
        nextInvoiceDate: periodEnd ? new Date(periodEnd * 1000).toISOString().slice(0, 10) : null,
      }
    },
  }
}

export const defaultPlanChangeDeps: PlanChangeDeps = {
  findClient,
  extract: extractPlanChange,
  recall: async (clientName) => {
    try {
      return await recall(clientName, 'subscription plan discount terms')
    } catch {
      return recallSeededFacts(clientName)
    }
  },
  discount: extractDiscountTerms,
  gateway: stripeSubscriptionGateway(),
  remember: (clientName, role, fact, sourceMessageId) => remember(clientName, role, fact, sourceMessageId),
  reply: (message, text) => reply(message, text),
}

function savedPlanDecision(messageId: string): PlanDecision | null {
  const event = getEvent(messageId, DECIDE_STEP)
  if (!event) return null
  const parsed = savedPlanDecisionSchema.safeParse(JSON.parse(event.data_json))
  return parsed.success ? parsed.data : null
}

// One Stripe change per message: the ledger check covers replays, the idempotency keys cover a crash between the call and the ledger write.
async function applyPlanChange(message: ChannelMessage, decision: PlanDecision, deps: PlanChangeDeps): Promise<void> {
  const plan = decision.plan
  if (!plan || getEvent(message.id, CHANGE_STEP)) return
  if (await blockIfPaused(message)) return
  const client = deps.findClient(decision.clientName)
  if (!client) return
  try {
    const result = await deps.gateway.subscribe(client, plan, message.id)
    const planText = describePlan(plan)
    const amountText = `${money(plan.unitAmountPence)} net per ${plan.interval}`
    const verb = result.action === 'created' ? 'Created' : result.action === 'updated' ? 'Updated' : 'Confirmed'
    recordStep(message.id, CHANGE_STEP, `${verb} Stripe subscription ${result.subscriptionId}: ${planText}, ${amountText}.`, {
      ...result,
      plan,
      previousPlan: decision.previousPlan,
      quote: decision.quote,
    }, ['P13'])

    const fact = `Subscription plan: ${planText} at ${amountText} (Stripe ${result.subscriptionId})`
    try {
      await deps.remember(client.name, 'billing', fact, message.id)
      recordStep(message.id, 'remember', 'Remembered the subscription plan for billing.', { clientName: client.name, fact }, ['P13'])
    } catch (error) {
      recordStep(message.id, 'remember', 'Memory write for the subscription plan failed.', { error: String(error) }, ['P13'])
    }

    recordStep(message.id, 'staff_note', `${client.name} moved from ${decision.previousPlan} to ${planText} at ${amountText}. Stripe subscription ${result.subscriptionId} ${result.action}; next invoice ${result.nextInvoiceDate ?? 'per Stripe'}.`, {
      clientName: client.name,
      from: decision.previousPlan,
      to: planText,
      unitAmountPence: plan.unitAmountPence,
      interval: plan.interval,
      subscriptionId: result.subscriptionId,
      action: result.action,
      nextInvoiceDate: result.nextInvoiceDate,
      quote: decision.quote,
    }, ['P13'])

    const discountText = plan.discountPercent > 0 ? `, ${plan.discountPercent}% remembered discount` : ''
    await deps.reply(message, [
      `Plan ${result.action === 'created' ? 'set up' : 'updated'}: ${PRODUCT_NAME}, ${planText}.`,
      `${amountText} (${plan.leads} leads at ${money(plan.pricePerLeadPence)} per lead${discountText}). VAT is added on the invoice.`,
      `Stripe subscription ${result.subscriptionId}. Next invoice: ${result.nextInvoiceDate ?? 'per Stripe'}.${result.action === 'updated' ? ' The change is prorated.' : ''}`,
      `Quote: “${decision.quote}”`,
      'Policy: P13.',
    ].join('\n'))
  } catch (error) {
    if (!(error instanceof BillingBlockedError)) throw error
    recordStep(message.id, 'billing_blocked', error.message, { plan }, ['P13'])
    await deps.reply(message, `Plan change blocked: ${error.message}`)
  }
}

/** Returns true when the message asks a known client's plan to change and was handled here. */
export async function handlePlanChange(message: ChannelMessage, deps: PlanChangeDeps = defaultPlanChangeDeps): Promise<boolean> {
  if (message.author === 'tally' || !PLAN_WORDS.test(message.text)) return false
  // P5: an unknown sender falls through to the commitment path, which refuses it.
  const client = deps.findClient(message.author)
  if (!client) return false

  const prior = savedPlanDecision(message.id)
  if (prior) {
    if (prior.outcome === 'auto') await applyPlanChange(message, prior, deps)
    markMessageProcessed(message.id)
    return true
  }

  const { change, model } = await deps.extract(message)
  const quoteValid = change.quote.length > 0 && message.text.includes(change.quote)
  if (!change.isPlanChange || !quoteValid) return false
  recordStep(message.id, 'plan_extract', 'Extracted a plan change and validated its verbatim quote.', { ...change, model }, ['P1', 'P13'])

  const facts = await deps.recall(client.name)
  const discount = await deps.discount(facts)
  recordStep(message.id, 'recall', `Recalled ${facts.length} client memory facts.`, { facts, discount: discount.terms, model: discount.model }, ['P3'])

  const decision = decidePlanChange({ client, change, discount: discount.terms, facts, previousPlan: rememberedPlan(facts) })
  recordStep(message.id, DECIDE_STEP, decision.reason, decision, ['P13'])
  if (decision.outcome === 'refuse') {
    await deps.reply(message, `I could not change the plan. ${decision.reason}`)
  } else if (decision.outcome === 'needs_approval' && decision.plan) {
    const amount = `${money(decision.plan.annualValuePence)} a year`
    saveApproval({ id: message.id, message_id: message.id, status: 'pending', reason: `Plan change ${decision.reason}` })
    recordStep(message.id, 'approval', 'Requested account-owner approval for the plan change.', { amount, plan: decision.plan }, ['P13'])
    await deps.reply(message, `Approval required for ${amount}: ${describePlan(decision.plan)}. ${decision.reason} Approve here or in Tally.`)
  } else {
    await applyPlanChange(message, decision, deps)
  }
  markMessageProcessed(message.id)
  return true
}

/** Returns true when the approval belongs to a plan change and was handled here. */
export async function handlePlanChangeApproval(
  messageId: string,
  action: 'approve' | 'reject',
  deps: PlanChangeDeps = defaultPlanChangeDeps,
): Promise<boolean> {
  const decision = savedPlanDecision(messageId)
  const message = getMessage(messageId)
  if (!decision || !message) return false
  updateApproval(messageId, action === 'approve' ? 'approved' : 'rejected')
  recordStep(messageId, 'approval', action === 'approve' ? 'Account owner approved the plan change.' : 'Account owner rejected the plan change.', { action }, ['P13'])
  if (action === 'approve') await applyPlanChange(message, decision, deps)
  else await deps.reply(message, 'Plan change rejected. The Stripe subscription was not changed.')
  markMessageProcessed(messageId)
  return true
}
