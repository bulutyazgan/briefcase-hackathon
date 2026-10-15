import type { SourcedLead, SourcingResult } from '../leads/sourcing'
import { decide, type BillableIntent, type Decision, type MemoryFact } from '../policy/decide'
import type { DiscountTerms } from './discount'
import { checkMargin, type MarginCheck } from './pricing'

export interface SettledOrder {
  // Leads we bill for: what was bought, never more than requested.
  leads: SourcedLead[]
  costMicro: number
  decision: Decision
  margin: MarginCheck
}

// After sourcing: re-price for exactly the leads bought (P2) and check margin (P8).
// The re-priced total can only be lower than or equal to the approved total, so
// P4 is already satisfied by the pre-sourcing decision or approval.
export function settleOrder(
  intent: BillableIntent,
  facts: MemoryFact[],
  discountTerms: DiscountTerms | null,
  requestedQuantity: number,
  sourcing: SourcingResult,
): SettledOrder {
  const leads = sourcing.leads.slice(0, requestedQuantity)
  const decision = decide(intent, facts, leads.length, discountTerms)
  const margin = checkMargin(decision.totalPence, sourcing.costMicro)
  const clauses = decision.outcome === 'refuse' ? decision.clauses : [...decision.clauses, 'P8', 'P9']
  return {
    leads,
    costMicro: sourcing.costMicro,
    decision: {
      ...decision,
      clauses,
      lines: decision.lines.map((line) => ({ ...line, clauses })),
      outcome: decision.outcome === 'refuse' ? 'refuse' : margin.ok ? 'auto' : 'needs_approval',
      reason: decision.outcome === 'refuse'
        ? decision.reason
        : margin.ok
          ? `Billing ${leads.length} leads bought; margin ${(margin.marginRatio * 100).toFixed(0)}% meets P8.`
          : `Margin ${(margin.marginRatio * 100).toFixed(0)}% is below the 40% minimum (P8).`,
    },
    margin,
  }
}
