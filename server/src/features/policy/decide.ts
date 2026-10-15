import { findClient } from '../clients/clients'
import { regexDiscountTerms, validateDiscount, type DiscountTerms } from '../pricing/discount'
import { priceOrder } from '../pricing/pricing'

export { MAX_DISCOUNT_PERCENT } from '../pricing/discount'
export const AUTO_SEND_LIMIT_PENCE = 100000

export interface BillableIntent {
  isCommitment: boolean
  clientName: string
  ask: string
  icp: string
  signals: string[]
  quantity: number | null
  quote: string
}

export interface MemoryFact {
  fact: string
  date: string
}

export interface PricedLine {
  description: string
  quantity: number
  unitPricePence: number
  totalPence: number
  quote: string
  memoryFact: string
  clauses: string[]
}

export interface Decision {
  outcome: 'auto' | 'needs_approval' | 'refuse'
  clauses: string[]
  lines: PricedLine[]
  totalPence: number
  reason: string
}

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

// P1, P2, P3, P4, P5. `quantity` is the requested quantity before sourcing and
// the bought quantity when the loop re-prices for the final bill.
export function decide(
  intent: BillableIntent,
  facts: MemoryFact[],
  quantity: number,
  discountTerms: DiscountTerms | null = regexDiscountTerms(facts),
): Decision {
  const clauses = ['P1', 'P2', 'P5', 'P6']
  if (!intent.isCommitment || !intent.quote || !intent.ask) {
    return { outcome: 'refuse', clauses, lines: [], totalPence: 0, reason: 'No explicit client commitment.' }
  }
  const client = findClient(intent.clientName)
  if (!client) {
    return {
      outcome: 'refuse',
      clauses,
      lines: [],
      totalPence: 0,
      reason: `Unknown client "${intent.clientName}". Please confirm who you are before we bill.`,
    }
  }
  if (quantity < 1) {
    return { outcome: 'refuse', clauses, lines: [], totalPence: 0, reason: 'No billable lead quantity.' }
  }

  const discount = validateDiscount(discountTerms, quantity, facts)
  const price = priceOrder(client, quantity, discount.percent)
  if (discountTerms) clauses.push('P3')
  const clausesForLine = [...clauses, 'P4']
  const lines: PricedLine[] = [{
    description: `Leads: ${intent.icp}`,
    quantity,
    unitPricePence: price.unitPricePence,
    totalPence: price.netPence,
    quote: intent.quote,
    memoryFact: discount.memoryFact,
    clauses: clausesForLine,
  }]
  if (price.netPence > AUTO_SEND_LIMIT_PENCE) {
    return {
      outcome: 'needs_approval',
      clauses: clausesForLine,
      lines,
      totalPence: price.netPence,
      reason: `${money(price.netPence)} exceeds the £1,000 approval limit.`,
    }
  }
  return { outcome: 'auto', clauses: clausesForLine, lines, totalPence: price.netPence, reason: 'Within policy limits.' }
}
