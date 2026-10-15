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

export function titleFromIcp(icp: string): string {
  const head = icp.split(/\s+(?:at|in|from|for|@)\s+/i)[0]?.trim()
  return head && head.length > 0 ? head : icp.trim()
}

export function fallbackProposal(request: SourcingRequest): Proposal {
  return {
    calls: [{
      endpointId: 'apollo.people.search',
      params: { person_titles: [titleFromIcp(request.icp)], per_page: Math.min(request.quantity, 100) },
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
