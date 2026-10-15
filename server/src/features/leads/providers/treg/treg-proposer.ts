import { generateObject } from 'ai'
import { createFireworks } from '@ai-sdk/fireworks'
import { z } from 'zod'
import type { SourcingRequest } from '../../sourcing'
import { tregAllowlist } from './treg-catalog'
import type { TregParams } from './treg-client'

// The LLM only proposes catalogue calls. treg-sourcer.ts decides which ones run (P9, P10).

export interface ProposedCall {
  endpointId: string
  params: TregParams
}

export interface Proposal {
  calls: ProposedCall[]
  model: string
}

export type Proposer = (request: SourcingRequest) => Promise<Proposal>

// Params as key/values pairs: JSON-schema records are poorly supported by some models.
const proposalSchema = z.object({
  calls: z.array(z.object({
    endpointId: z.string(),
    params: z.array(z.object({ key: z.string(), values: z.array(z.string()) })),
  })).max(5),
})

function toParams(pairs: { key: string; values: string[] }[]): TregParams {
  const params: TregParams = {}
  for (const { key, values } of pairs) {
    const isArray = key.endsWith('[]')
    const name = isArray ? key.slice(0, -2) : key
    if (isArray || values.length > 1) params[name] = values
    else if (values[0] !== undefined) params[name] = values[0]
  }
  return params
}

// Role words Apollo indexes as titles. The rest of the ICP becomes keywords, and "in <place>" a location.
const ROLE_TITLES: ReadonlyArray<[RegExp, string[]]> = [
  [/\bcfos?\b|chief financial officers?|finance directors?/i, ['CFO', 'Chief Financial Officer', 'Finance Director']],
  [/\bceos?\b|chief executive officers?/i, ['CEO', 'Chief Executive Officer']],
  [/\bctos?\b|chief technology officers?/i, ['CTO', 'Chief Technology Officer']],
  [/\bcoos?\b|chief operating officers?/i, ['COO', 'Chief Operating Officer']],
  [/\bfounders?\b/i, ['Founder', 'Co-Founder']],
  [/heads? of procurement|procurement (?:leads?|managers?)/i, ['Head of Procurement', 'Procurement Manager']],
]
const STOP_WORDS = new Set(['lead', 'leads', 'list', 'the', 'a', 'an', 'of', 'and', 'for', 'at', 'in', 'from', 'to', 'with'])

export function titleFromIcp(icp: string): string {
  const head = icp.split(/\s+(?:at|in|from|for|@)\s+/i)[0]?.trim()
  return head && head.length > 0 ? head : icp.trim()
}

export function queryFromIcp(icp: string): { person_titles: string[]; q_keywords?: string; person_locations?: string[] } {
  const titles = ROLE_TITLES.find(([pattern]) => pattern.test(icp))?.[1] ?? [titleFromIcp(icp)]
  const location = icp.match(/\bin\s+([A-Z][A-Za-z .'-]+)$/)?.[1]?.trim()
  const head = icp.split(/\s+(?:at|in|from|for|@)\s+/i)[0] ?? icp
  const keywords = head.split(/\s+/).filter((word) => {
    const lower = word.toLowerCase()
    return lower.length > 2 && !STOP_WORDS.has(lower) && !ROLE_TITLES.some(([pattern]) => pattern.test(word))
  })
  return {
    person_titles: titles,
    ...(keywords.length ? { q_keywords: keywords.join(' ') } : {}),
    ...(location ? { person_locations: [location] } : {}),
  }
}

export function fallbackProposal(request: SourcingRequest): Proposal {
  return {
    calls: [{
      endpointId: 'apollo.people.search',
      params: { ...queryFromIcp(request.icp), per_page: Math.min(request.quantity, 100) },
    }],
    model: 'local-fallback',
  }
}

export const fireworksProposer: Proposer = async (request) => {
  const apiKey = process.env.FIREWORKS_API_KEY
  if (!apiKey) return fallbackProposal(request)
  const fireworks = createFireworks({ apiKey })
  const prompt = [
    'Propose Treg catalogue calls that find leads matching this ideal customer profile.',
    'Only use these endpoint ids:',
    ...tregAllowlist.map((endpoint) => `- ${endpoint.id} (${endpoint.kind}): ${endpoint.description}`),
    'Prefer apollo.people.search. Use as few calls as possible. Array params end with [].',
    `ICP: ${request.icp}`,
    `Buying signals: ${request.signals.join('; ') || 'none'}`,
    `Leads wanted: ${request.quantity}`,
  ].join('\n')
  const models = [
    'accounts/fireworks/models/deepseek-v4p1-flash',
    'accounts/fireworks/models/glm-5p3-flash',
  ]
  for (const modelId of models) {
    try {
      const result = await generateObject({ model: fireworks(modelId), schema: proposalSchema, prompt })
      const calls = result.object.calls.map((call) => ({ endpointId: call.endpointId, params: toParams(call.params) }))
      if (calls.length > 0) return { calls, model: modelId }
    } catch (error) {
      console.warn(`Fireworks Treg proposal failed for ${modelId}: ${String(error)}`)
    }
  }
  return { ...fallbackProposal(request), model: 'local-fallback-after-model-error' }
}
