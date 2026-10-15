import { z } from 'zod'
import type { SourcedLead, Sourcer, SourcingCall, SourcingRequest } from '../../sourcing'
import { findAllowedEndpoint, type TregEndpoint } from './treg-catalog'
import { createTregClient, TregCallError, TregUnavailableError, type FetchLike, type TregClient } from './treg-client'
import { fireworksProposer, type Proposer } from './treg-proposer'

// Apollo caps a page at 100 rows, so larger orders page through results.
const MAX_PAGE_SIZE = 100

const peopleSchema = z.object({
  people: z.array(z.object({
    id: z.string(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    last_name_obfuscated: z.string().nullish(),
    name: z.string().nullish(),
    linkedin_url: z.string().nullish(),
    organization: z.object({
      name: z.string().nullish(),
      website_url: z.string().nullish(),
    }).nullish(),
  })).default([]),
})

const companiesSchema = z.object({
  organizations: z.array(z.object({
    id: z.string(),
    name: z.string().nullish(),
    website_url: z.string().nullish(),
    primary_domain: z.string().nullish(),
  })).default([]),
})

interface UnpricedLead {
  id: string
  name: string
  company: string
  url: string
}

function leadsFromBody(endpoint: TregEndpoint, body: unknown): UnpricedLead[] {
  if (endpoint.kind === 'people') {
    const parsed = peopleSchema.safeParse(body)
    if (!parsed.success) return []
    return parsed.data.people.flatMap((person) => {
      const name = person.name
        ?? [person.first_name, person.last_name ?? person.last_name_obfuscated].filter(Boolean).join(' ')
      if (!name) return []
      return [{
        id: `treg:${endpoint.id}:${person.id}`,
        name,
        company: person.organization?.name ?? 'Unknown',
        // Apollo api_search returns no profile URL; link the Apollo record (assumed URL format).
        url: person.linkedin_url ?? `https://app.apollo.io/#/people/${person.id}`,
      }]
    })
  }
  if (endpoint.kind === 'company') {
    const parsed = companiesSchema.safeParse(body)
    if (!parsed.success) return []
    return parsed.data.organizations.flatMap((org) => {
      if (!org.name) return []
      const url = org.website_url ?? (org.primary_domain ? `https://${org.primary_domain}` : null)
      if (!url) return []
      return [{ id: `treg:${endpoint.id}:${org.id}`, name: org.name, company: org.name, url }]
    })
  }
  // Signal endpoints inform targeting; they do not produce billable leads on their own.
  return []
}

// Splits a call's integer cost across its leads so the parts sum exactly to the call cost.
function splitCost(costMicro: number, count: number): number[] {
  if (count === 0) return []
  const base = Math.floor(costMicro / count)
  const remainder = costMicro - base * count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}

export interface TregSourcerDeps {
  token?: string
  baseUrl?: string
  fetch?: FetchLike
  client?: TregClient
  propose?: Proposer
}

export function createTregSourcer(deps: TregSourcerDeps = {}): Sourcer {
  return async (request: SourcingRequest) => {
    const token = deps.token ?? process.env.TREG_TOKEN
    if (!deps.client && !token) {
      throw new TregUnavailableError('TREG_TOKEN is not set; fall back to Firecrawl or seed leads.')
    }
    const client = deps.client ?? createTregClient({ token: token ?? '', baseUrl: deps.baseUrl, fetch: deps.fetch })
    const proposal = await (deps.propose ?? fireworksProposer)(request)

    const leads: SourcedLead[] = []
    const seen = new Set<string>()
    const calls: SourcingCall[] = []
    let spentMicro = 0

    for (const proposed of proposal.calls) {
      const endpoint = findAllowedEndpoint(proposed.endpointId)
      if (!endpoint) {
        calls.push({ endpointId: proposed.endpointId, accepted: false, reason: 'Endpoint is not on the Treg allowlist.', costMicro: 0, clauses: ['P10'] })
        continue
      }
      // Every page is its own gated call: quantity, then the P9 order cap, then the per-call cap at Treg.
      for (let page = 1; ; page += 1) {
        const remainingLeads = request.quantity - leads.length
        if (remainingLeads <= 0) {
          if (page === 1) {
            calls.push({ endpointId: endpoint.id, page, accepted: false, reason: `Quantity ${request.quantity} already reached.`, costMicro: 0, clauses: [] })
          }
          break
        }
        const remainingBudget = request.maxTotalCostMicro - spentMicro
        if (endpoint.maxCostMicro > remainingBudget) {
          calls.push({
            endpointId: endpoint.id,
            page,
            accepted: false,
            reason: `Per-call cap ${endpoint.maxCostMicro} µUSD exceeds remaining order budget ${remainingBudget} µUSD.`,
            costMicro: 0,
            clauses: ['P9'],
          })
          break
        }
        // Code owns page size: never ask for more rows than we still need.
        const perPage = Math.min(Math.max(remainingLeads, 1), MAX_PAGE_SIZE)
        const params = { ...proposed.params, page, per_page: perPage }
        try {
          const result = await client.call(endpoint.id, params, endpoint.maxCostMicro)
          spentMicro += result.costMicro
          const returned = leadsFromBody(endpoint, result.body)
          const fresh = returned
            .filter((lead) => !seen.has(lead.id))
            .slice(0, remainingLeads)
          const shares = splitCost(result.costMicro, fresh.length)
          fresh.forEach((lead, index) => {
            seen.add(lead.id)
            leads.push({ ...lead, provider: endpoint.provider, costMicro: shares[index] ?? 0 })
          })
          calls.push({
            endpointId: endpoint.id,
            page,
            accepted: true,
            reason: `Allowlisted; cap ${endpoint.maxCostMicro} µUSD within order budget. Page ${page}: ${fresh.length} leads.`,
            costMicro: result.costMicro,
            clauses: ['P9', 'P10'],
          })
          // A short page means the search is exhausted; a page with nothing new means paging has stalled.
          if (returned.length < perPage || fresh.length === 0) break
        } catch (error) {
          if (!(error instanceof TregCallError)) throw error
          spentMicro += error.costMicro
          calls.push({
            endpointId: endpoint.id,
            page,
            accepted: false,
            reason: error.refusedOverCap ? 'Treg refused: over X-Treg-Route-Max-Cost.' : error.message,
            costMicro: error.costMicro,
            clauses: error.refusedOverCap ? ['P9'] : [],
          })
          break
        }
      }
    }

    return { leads, costMicro: spentMicro, calls, source: 'treg' }
  }
}

export const tregSourcer: Sourcer = createTregSourcer()
