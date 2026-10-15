import type { Client } from '../clients/clients'
import type { MemoryFact } from '../policy/decide'
import { validateDiscount, type DiscountTerms } from '../pricing/discount'

export const planIntervals = ['month', 'year'] as const
export type PlanInterval = typeof planIntervals[number]

export interface Plan {
  id: string
  leadsPerMonth: number
}

// P13: a conversation can only move a client onto a plan in this catalogue.
export const PRODUCT_NAME = 'Lead list subscription'
export const DEFAULT_PLAN: Plan = { id: 'lead-list-100', leadsPerMonth: 100 }
export const PLAN_CATALOGUE: readonly Plan[] = [DEFAULT_PLAN]

const MONTHS_PER_PERIOD: Record<PlanInterval, number> = { month: 1, year: 12 }

export function findPlan(leadsPerMonth: number): Plan | null {
  return PLAN_CATALOGUE.find((plan) => plan.leadsPerMonth === leadsPerMonth) ?? null
}

export interface PlanQuote {
  planId: string
  leadsPerMonth: number
  interval: PlanInterval
  months: number
  clientName: string
  pricePerLeadPence: number
  leads: number
  listPence: number
  discountPercent: number
  discountFact: string
  // Net amount Stripe bills per period: the Price's unit_amount.
  unitAmountPence: number
  annualValuePence: number
}

// Price per period = leads in the period x the client's rate, less the remembered discount
// when it is dated, within 15% and the period's lead count clears its threshold (P2, P3).
export function quotePlan(
  plan: Plan,
  interval: PlanInterval,
  client: Client,
  discount: DiscountTerms | null,
  facts: MemoryFact[],
): PlanQuote {
  const months = MONTHS_PER_PERIOD[interval]
  const leads = plan.leadsPerMonth * months
  const listPence = leads * client.pricePerLeadPence
  const validated = validateDiscount(discount, leads, facts)
  const unitAmountPence = Math.round(listPence * (100 - validated.percent) / 100)
  return {
    planId: plan.id,
    leadsPerMonth: plan.leadsPerMonth,
    interval,
    months,
    clientName: client.name,
    pricePerLeadPence: client.pricePerLeadPence,
    leads,
    listPence,
    discountPercent: validated.percent,
    discountFact: validated.memoryFact,
    unitAmountPence,
    annualValuePence: unitAmountPence * (12 / months),
  }
}

export function money(pence: number): string {
  return `£${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(pence / 100)}`
}

export function describePlan(quote: Pick<PlanQuote, 'leadsPerMonth' | 'interval'>): string {
  return `${quote.leadsPerMonth} leads a month, billed ${quote.interval === 'year' ? 'yearly' : 'monthly'}`
}
