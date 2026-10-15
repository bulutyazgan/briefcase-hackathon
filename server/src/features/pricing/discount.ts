import { generateObject } from 'ai'
import { createFireworks } from '@ai-sdk/fireworks'
import { z } from 'zod'
import type { MemoryFact } from '../policy/decide'

export const MAX_DISCOUNT_PERCENT = 15

// What the LLM (or the regex fallback) extracts from recalled memory.
// Code validates it against P3 before any price uses it.
export const discountTermsSchema = z.object({
  percent: z.number(),
  threshold: z.number(),
  date: z.string(),
  fact: z.string(),
})
export type DiscountTerms = z.infer<typeof discountTermsSchema>

const extractionSchema = z.object({ discount: discountTermsSchema.nullable() })

const DISCOUNT_PATTERN = /agreed\s+(\d{1,3})%\s+off\s+orders\s+over\s+(\d+)/i

export function regexDiscountTerms(facts: MemoryFact[]): DiscountTerms | null {
  for (const entry of facts) {
    const match = entry.fact.match(DISCOUNT_PATTERN)
    if (!match) continue
    return { percent: Number(match[1]), threshold: Number(match[2]), date: entry.date, fact: entry.fact }
  }
  return null
}

export async function extractDiscountTerms(
  facts: MemoryFact[],
): Promise<{ terms: DiscountTerms | null; model: string }> {
  const apiKey = process.env.FIREWORKS_API_KEY
  if (!apiKey || !facts.length) return { terms: regexDiscountTerms(facts), model: 'local-fallback' }
  const fireworks = createFireworks({ apiKey })
  const prompt = [
    'From these remembered client facts, extract the agreed volume discount, if any.',
    'Return percent, the lead-count threshold it applies over, the date of the fact (YYYY-MM-DD) and the fact text verbatim.',
    'If no discount was agreed, return null. Do not invent a date.',
    ...facts.map((entry) => `- [${entry.date || 'undated'}] ${entry.fact}`),
  ].join('\n')
  const models = [
    'accounts/fireworks/models/deepseek-v4p1-flash',
    'accounts/fireworks/models/glm-5p3-flash',
  ]
  for (const modelId of models) {
    try {
      const result = await generateObject({ model: fireworks(modelId), schema: extractionSchema, prompt })
      return { terms: result.object.discount, model: modelId }
    } catch (error) {
      console.warn(`Fireworks discount extraction failed for ${modelId}: ${String(error)}`)
    }
  }
  return { terms: regexDiscountTerms(facts), model: 'local-fallback-after-model-error' }
}

export interface ValidatedDiscount {
  percent: number
  memoryFact: string
  reason: string
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// P3: discounts only if remembered as agreed with a date, never above 15%,
// and only when the order quantity is over the agreed threshold.
export function validateDiscount(
  terms: DiscountTerms | null,
  quantity: number,
  facts: MemoryFact[] = [],
): ValidatedDiscount {
  if (!terms) return { percent: 0, memoryFact: 'No eligible discount was recalled.', reason: 'No discount recalled.' }
  // The fact must really be in recall: the model cannot invent one.
  const backed = !facts.length || facts.some((entry) => entry.fact === terms.fact || entry.fact.includes(terms.fact))
  if (!backed) {
    return { percent: 0, memoryFact: 'No eligible discount was recalled.', reason: 'Discount not found in recalled memory.' }
  }
  if (!DATE_PATTERN.test(terms.date) || Number.isNaN(Date.parse(terms.date))) {
    return { percent: 0, memoryFact: `${terms.fact} (rejected: undated)`, reason: 'Discount is not dated (P3).' }
  }
  if (!(terms.percent > 0)) {
    return { percent: 0, memoryFact: 'No eligible discount was recalled.', reason: 'Discount percent is not positive.' }
  }
  if (quantity <= terms.threshold) {
    return {
      percent: 0,
      memoryFact: `${terms.date}: ${terms.fact} (not applied: ${quantity} is not over ${terms.threshold})`,
      reason: 'Order is below the discount threshold.',
    }
  }
  const percent = Math.min(terms.percent, MAX_DISCOUNT_PERCENT)
  return {
    percent,
    memoryFact: `${terms.date}: ${terms.fact}`,
    reason: percent < terms.percent ? `Discount capped at ${MAX_DISCOUNT_PERCENT}% (P3).` : 'Discount validated (P3).',
  }
}
