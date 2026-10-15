import type { Client } from '../clients/clients'

// Fixed FX rate used to compare Treg sourcing cost (micro-USD) with invoice
// amounts (pence). 1 USD = 79p. A fixed constant keeps margin checks
// deterministic and auditable; revisit if the business needs live FX.
export const PENCE_PER_USD = 79
export const MICRO_PER_USD = 1_000_000

// P8: margin over sourcing cost must be at least 40%, else approval.
export const MIN_MARGIN_RATIO = 0.4
// P9: total sourcing spend per order is capped at 60% of the invoice net.
export const SOURCING_CAP_RATIO = 0.6

export interface Price {
  unitPricePence: number
  quantity: number
  grossPence: number
  discountPercent: number
  discountPence: number
  netPence: number
}

// P2: client price list × quantity − validated discount.
export function priceOrder(client: Client, quantity: number, discountPercent: number): Price {
  const grossPence = client.pricePerLeadPence * quantity
  const netPence = Math.round(grossPence * (100 - discountPercent) / 100)
  return {
    unitPricePence: client.pricePerLeadPence,
    quantity,
    grossPence,
    discountPercent,
    discountPence: grossPence - netPence,
    netPence,
  }
}

export function microUsdToPence(costMicro: number): number {
  return costMicro / MICRO_PER_USD * PENCE_PER_USD
}

export function penceToMicroUsd(pence: number): number {
  return pence / PENCE_PER_USD * MICRO_PER_USD
}

// P9: order sourcing cap in micro-USD.
export function sourcingCapMicro(netPence: number): number {
  return Math.floor(penceToMicroUsd(netPence * SOURCING_CAP_RATIO))
}

export interface MarginCheck {
  ok: boolean
  netPence: number
  costPence: number
  marginRatio: number
  clauses: string[]
}

// P8: margin = (invoice net − sourcing cost) / invoice net.
export function checkMargin(netPence: number, costMicro: number): MarginCheck {
  const costPence = microUsdToPence(costMicro)
  const marginRatio = netPence > 0 ? (netPence - costPence) / netPence : 0
  return {
    ok: netPence > 0 && marginRatio >= MIN_MARGIN_RATIO,
    netPence,
    costPence: Math.round(costPence),
    marginRatio,
    clauses: ['P8'],
  }
}
