export const RATE_PENCE = 400
export const AUTO_SEND_LIMIT_PENCE = 100000
export const MAX_DISCOUNT_PERCENT = 15

export interface BillableIntent {
  isCommitment: boolean
  clientName: string
  ask: string
  icp: string
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

export function discountFromFacts(facts: MemoryFact[], quantity: number): number {
  const discountFact = facts.find((entry) =>
    /agreed\s+(\d{1,2})%\s+off\s+orders\s+over\s+(\d+)/i.test(entry.fact),
  )
  if (!discountFact) return 0
  const match = discountFact.fact.match(/agreed\s+(\d{1,2})%\s+off\s+orders\s+over\s+(\d+)/i)
  if (!match) return 0
  const discount = Number(match[1])
  const threshold = Number(match[2])
  return quantity > threshold ? Math.min(discount, MAX_DISCOUNT_PERCENT) : 0
}

export function decide(
  intent: BillableIntent,
  facts: MemoryFact[],
  quantity: number,
  availableCount = quantity,
): Decision {
  const clauses = ['P1', 'P2', 'P5', 'P6']
  const clientIsKnown = /northwind capital/i.test(intent.clientName)
  if (!intent.isCommitment || !intent.quote || !intent.ask) {
    return { outcome: 'refuse', clauses, lines: [], totalPence: 0, reason: 'No explicit client commitment.' }
  }
  if (!clientIsKnown) {
    return { outcome: 'refuse', clauses, lines: [], totalPence: 0, reason: 'Unknown client.' }
  }
  if (quantity < 1) {
    return { outcome: 'refuse', clauses, lines: [], totalPence: 0, reason: 'No billable lead quantity.' }
  }

  const discountPercent = discountFromFacts(facts, quantity)
  const memoryFact = discountPercent > 0
    ? facts.find((fact) => /agreed\s+\d{1,2}%\s+off/i.test(fact.fact))
    : { fact: 'No eligible discount was recalled.', date: '' }
  const grossPence = quantity * RATE_PENCE
  const totalPence = Math.round(grossPence * (100 - discountPercent) / 100)
  if (discountPercent > 0) clauses.push('P3')
  const clausesForLine = [...clauses, 'P4']
  const lines: PricedLine[] = [{
    description: `Fintech CFO leads in London (${availableCount} sourced)`,
    quantity,
    unitPricePence: RATE_PENCE,
    totalPence,
    quote: intent.quote,
    memoryFact: memoryFact?.date ? `${memoryFact.date}: ${memoryFact.fact}` : memoryFact?.fact ?? 'No discount',
    clauses: clausesForLine,
  }]
  if (totalPence > AUTO_SEND_LIMIT_PENCE) {
    return {
      outcome: 'needs_approval',
      clauses: clausesForLine,
      lines,
      totalPence,
      reason: `£${(totalPence / 100).toFixed(2)} exceeds the £1,000 approval limit.`,
    }
  }
  return { outcome: 'auto', clauses: clausesForLine, lines, totalPence, reason: 'Within policy limits.' }
}
