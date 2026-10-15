export const BUYER_AGENT_AUTHOR = 'Northwind procurement agent'
export const MONTHLY_BUDGET_PENCE = 150000
export const MAX_NET_PENCE_PER_LEAD = 500
export const DEFAULT_ORDER = {
  poNumber: 'PO-2026-104',
  text: "PO-2026-104: Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time.",
} as const

export type BuyerClause = 'B1' | 'B2' | 'B3'

export type Verdict =
  | { ok: true; clauses: BuyerClause[] }
  | { ok: false; clause: BuyerClause; reason: string }

export interface InvoiceLine {
  netPence: number
  leads: number
}

export interface BuyerInvoice {
  id: string
  customerId: string
  status: string
  totalPence: number
  lines: InvoiceLine[]
  poNumber: string | null
}

export interface CounterOffer {
  leads: number
  pricePence: number
}

export function money(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: pence % 100 ? 2 : 0 })}`
}

export function extractPoNumber(text: string): string | null {
  return text.match(/\bPO-\d{4}-\d{1,6}\b/)?.[0] ?? null
}

export function parseCounterOffer(text: string): CounterOffer | null {
  const match = text.match(/\bAdd (\d+) more leads for £([\d,]+(?:\.\d{1,2})?)/i)
  if (!match?.[1] || !match[2]) return null
  return { leads: Number(match[1]), pricePence: Math.round(Number(match[2].replaceAll(',', '')) * 100) }
}

// A counter-offer never passes: it either breaks a limit or arrives without a PO (B3).
export function evaluateCounterOffer(offer: CounterOffer, spentPence: number, committedPence: number): Verdict {
  const projected = spentPence + committedPence + offer.pricePence
  if (projected > MONTHLY_BUDGET_PENCE) {
    return {
      ok: false,
      clause: 'B1',
      reason: `${money(offer.pricePence)} on top of ${money(spentPence + committedPence)} already committed would take this month to ${money(projected)}, over the ${money(MONTHLY_BUDGET_PENCE)} budget.`,
    }
  }
  if (offer.leads < 1 || offer.pricePence > offer.leads * MAX_NET_PENCE_PER_LEAD) {
    return { ok: false, clause: 'B2', reason: `The offer is above the ${money(MAX_NET_PENCE_PER_LEAD)} per lead ceiling.` }
  }
  return { ok: false, clause: 'B3', reason: 'A counter-offer is not an order. Every order needs its own PO number.' }
}

export function evaluateInvoice(invoice: BuyerInvoice, orderPo: string, spentPence: number): Verdict {
  if (!invoice.poNumber || invoice.poNumber !== orderPo) {
    return { ok: false, clause: 'B3', reason: `Invoice ${invoice.id} carries PO ${invoice.poNumber ?? 'none'}, not ${orderPo}.` }
  }
  const overpriced = invoice.lines.find((line) => line.leads < 1 || line.netPence > line.leads * MAX_NET_PENCE_PER_LEAD)
  if (!invoice.lines.length || overpriced) {
    const perLead = overpriced && overpriced.leads > 0 ? money(Math.round(overpriced.netPence / overpriced.leads)) : 'an unknown price'
    return { ok: false, clause: 'B2', reason: `Invoice ${invoice.id} charges ${perLead} per lead, above the ${money(MAX_NET_PENCE_PER_LEAD)} ceiling.` }
  }
  if (spentPence + invoice.totalPence > MONTHLY_BUDGET_PENCE) {
    return { ok: false, clause: 'B1', reason: `Paying ${money(invoice.totalPence)} would take this month to ${money(spentPence + invoice.totalPence)}, over the ${money(MONTHLY_BUDGET_PENCE)} budget.` }
  }
  return { ok: true, clauses: ['B1', 'B2', 'B3'] }
}
