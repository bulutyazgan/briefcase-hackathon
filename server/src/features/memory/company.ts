import { z } from 'zod'
import { getSetting, setSetting } from '../ledger/store'
import { cogneeConfigFromEnv, createCogneeClient, type CogneeClient } from './providers/cognee'

// The company knowledge base: what the agency sells, at what price, on what terms.
// Lives in Cognee dataset "company" with server/seed/company.json as the local copy.
export const COMPANY_DATASET = 'company'
export const STANDARD_PRICE_PER_LEAD_PENCE = 400
export const MINIMUM_ORDER_LEADS = 100

export const companyTopics = ['services', 'price', 'minimum', 'terms', 'discounts', 'delivery', 'vat', 'not-offered'] as const
export type CompanyTopic = typeof companyTopics[number]

export interface CompanyFact {
  topic: CompanyTopic
  fact: string
}

export interface CompanyMemoryOptions {
  // null forces the local fallback; undefined reads COGNEE_API_KEY from env.
  cognee?: CogneeClient | null
}

const companyFactsSchema = z.array(z.object({ topic: z.enum(companyTopics), fact: z.string() }))

export async function companyFacts(): Promise<CompanyFact[]> {
  const contents = await Bun.file(new URL('../../../seed/company.json', import.meta.url)).text()
  return companyFactsSchema.parse(JSON.parse(contents))
}

export function encodeCompanyFact(fact: CompanyFact): string {
  return `[company topic=${fact.topic}] ${fact.fact.replace(/\s+/g, ' ').trim()}`
}

const taggedCompanyPattern = /\[company topic=([a-z-]+)\]\s*([^[\n]+)/g

export function decodeCompanyFacts(text: string): CompanyFact[] {
  const facts: CompanyFact[] = []
  for (const match of text.matchAll(taggedCompanyPattern)) {
    const topic = z.enum(companyTopics).safeParse(match[1])
    const fact = match[2]?.trim()
    if (!topic.success || !fact) continue
    facts.push({ topic: topic.data, fact })
  }
  return facts
}

function resolveCognee(options: CompanyMemoryOptions): CogneeClient | null {
  if (options.cognee !== undefined) return options.cognee
  const config = cogneeConfigFromEnv()
  return config ? createCogneeClient(config) : null
}

// Idempotent: the ledger remembers which version of the seed file reached Cognee.
export async function seedCompanyKnowledge(options: CompanyMemoryOptions = {}): Promise<{ written: number; version: string }> {
  const facts = await companyFacts()
  const version = new Bun.CryptoHasher('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 16)
  const cognee = resolveCognee(options)
  if (!cognee) return { written: 0, version }
  const settingKey = `company_seed:${COMPANY_DATASET}`
  if (getSetting(settingKey) === version) return { written: 0, version }
  for (const fact of facts) await cognee.add(COMPANY_DATASET, encodeCompanyFact(fact))
  await cognee.cognify(COMPANY_DATASET)
  setSetting(settingKey, version)
  return { written: facts.length, version }
}

// Local facts always answer; Cognee adds what it found so the audit shows the knowledge base was consulted.
export async function recallCompanyFacts(query: string, options: CompanyMemoryOptions = {}): Promise<CompanyFact[]> {
  const local = await companyFacts()
  const cognee = resolveCognee(options)
  const remote = cognee
    ? (await cognee.search(COMPANY_DATASET, query)).flatMap(decodeCompanyFacts)
    : []
  const seen = new Set<string>()
  return [...local, ...remote].filter((entry) => {
    const key = `${entry.topic}|${entry.fact.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
