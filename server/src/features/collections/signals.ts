import { generateObject } from 'ai'
import { createFireworks } from '@ai-sdk/fireworks'
import { z } from 'zod'
import type { RoleFact } from '../memory/memory'

// The LLM only classifies remembered facts into this schema. Code validates the
// output and decides whether to chase (see collections.ts).

export interface Dispute {
  fact: RoleFact
}

export interface PaymentPromise {
  fact: RoleFact
  promisedDate: string
}

export interface CollectionSignals {
  disputes: Dispute[]
  promises: PaymentPromise[]
  model: string
}

export type SignalExtractor = (facts: RoleFact[]) => Promise<CollectionSignals>

const isoDate = /^\d{4}-\d{2}-\d{2}$/

const classificationSchema = z.object({
  items: z.array(z.object({
    index: z.number().int(),
    kind: z.enum(['dispute', 'promise_to_pay', 'other']),
    promisedDate: z.string().nullable(),
  })),
})

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

// Resolves "Friday", "tomorrow" or an ISO date relative to the date the fact was remembered.
export function resolvePromisedDate(text: string, factDate: string): string | null {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso?.[1]) return iso[1]
  if (/\btomorrow\b/i.test(text)) return addDays(factDate, 1)
  if (/\btoday\b/i.test(text)) return factDate
  const lower = text.toLowerCase()
  const target = weekdays.findIndex((day) => new RegExp(`\\b${day}\\b`).test(lower))
  if (target < 0 || !isoDate.test(factDate)) return null
  const from = new Date(`${factDate}T00:00:00Z`).getUTCDay()
  const delta = (target - from + 7) % 7 || 7
  return addDays(factDate, delta)
}

const disputePattern = /\b(disput\w*|invalid|not valid|refus\w* to pay|won'?t pay|contest\w*)\b/i
const promisePattern = /\b(we'?ll|we will|will|promis\w*\s+to)\s+pay\b/i

export function regexSignals(facts: RoleFact[]): CollectionSignals {
  const disputes: Dispute[] = []
  const promises: PaymentPromise[] = []
  for (const fact of facts) {
    if (disputePattern.test(fact.fact)) disputes.push({ fact })
    if (promisePattern.test(fact.fact)) {
      const promisedDate = resolvePromisedDate(fact.fact, fact.date)
      if (promisedDate) promises.push({ fact, promisedDate })
    }
  }
  return { disputes, promises, model: 'regex-fallback' }
}

const cache = new Map<string, CollectionSignals>()

export const extractSignals: SignalExtractor = async (facts) => {
  const apiKey = process.env.FIREWORKS_API_KEY
  if (!apiKey || facts.length === 0) return regexSignals(facts)
  const key = facts.map((entry) => `${entry.date}|${entry.fact}`).join('\n')
  const cached = cache.get(key)
  if (cached) return cached
  const prompt = [
    'Classify each remembered client fact for a collections agent.',
    'kind = "dispute" if the client disputes or contests an invoice or delivered work.',
    'kind = "promise_to_pay" if the client promised to pay on a date; give promisedDate as YYYY-MM-DD',
    'resolved relative to the fact date, else null. Otherwise kind = "other". Do not invent facts.',
    ...facts.map((entry, index) => `${index}. (${entry.date}) ${entry.fact}`),
  ].join('\n')
  try {
    const fireworks = createFireworks({ apiKey })
    const result = await generateObject({
      model: fireworks('accounts/fireworks/models/deepseek-v4p1-flash'),
      schema: classificationSchema,
      prompt,
    })
    const disputes: Dispute[] = []
    const promises: PaymentPromise[] = []
    for (const item of result.object.items) {
      const fact = facts[item.index]
      if (!fact) continue
      if (item.kind === 'dispute') disputes.push({ fact })
      if (item.kind === 'promise_to_pay') {
        // Code checks the date: an LLM date must be ISO; otherwise resolve it ourselves.
        const promisedDate = item.promisedDate && isoDate.test(item.promisedDate)
          ? item.promisedDate
          : resolvePromisedDate(fact.fact, fact.date)
        if (promisedDate) promises.push({ fact, promisedDate })
      }
    }
    // Belt and braces: never lose a dispute the regex can see.
    const fallback = regexSignals(facts)
    for (const dispute of fallback.disputes) {
      if (!disputes.some((entry) => entry.fact === dispute.fact)) disputes.push(dispute)
    }
    const signals = { disputes, promises, model: 'accounts/fireworks/models/deepseek-v4p1-flash' }
    cache.set(key, signals)
    return signals
  } catch (error) {
    console.warn(`Collections signal extraction failed: ${String(error)}`)
    return regexSignals(facts)
  }
}
