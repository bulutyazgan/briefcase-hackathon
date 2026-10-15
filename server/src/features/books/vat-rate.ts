import { VAT_PERCENT } from './books'

export const VAT_TAX_RATE = {
  display_name: 'VAT',
  percentage: VAT_PERCENT,
  inclusive: false,
  country: 'GB',
  jurisdiction: 'GB',
  tax_type: 'vat',
  description: 'UK VAT standard rate',
} as const

interface TaxRateLike {
  id: string
  display_name: string
  percentage: number
  inclusive: boolean
  country: string | null
  active: boolean
}

// The slice of the Stripe client this module needs, so tests can pass a fake.
export interface TaxRateClient {
  taxRates: {
    list(params: { active: boolean; inclusive: boolean; limit: number }): Promise<{ data: TaxRateLike[] }>
    create(params: typeof VAT_TAX_RATE, options: { idempotencyKey: string }): Promise<TaxRateLike>
  }
}

function isUkVat(rate: TaxRateLike): boolean {
  return rate.active
    && !rate.inclusive
    && rate.percentage === VAT_TAX_RATE.percentage
    && rate.country === VAT_TAX_RATE.country
    && rate.display_name === VAT_TAX_RATE.display_name
}

let cachedTaxRateId: string | null = null

// Looks up the 20% exclusive GB VAT rate and creates it only when missing.
export async function ensureVatTaxRate(stripe: TaxRateClient): Promise<string> {
  if (cachedTaxRateId) return cachedTaxRateId
  const existing = await stripe.taxRates.list({ active: true, inclusive: false, limit: 100 })
  const rate = existing.data.find(isUkVat)
    ?? await stripe.taxRates.create(VAT_TAX_RATE, { idempotencyKey: 'tally-uk-vat-20-exclusive' })
  cachedTaxRateId = rate.id
  return rate.id
}

export function resetVatTaxRateCache(): void {
  cachedTaxRateId = null
}
