// Treg HTTP client. Wire shapes (mirror these in a mock Treg server):
//
// Request:
//   POST ${TREG_BASE_URL}/call/<catalog-id>?<query>      (TREG_BASE_URL defaults to https://treg.to)
//   headers:
//     X-Treg-Token: <TREG_TOKEN>
//     X-Treg-Route-Max-Cost: <usd decimal, e.g. "0.01">   per-call ceiling (P9). Treg refuses with
//                                                          402 {"error":"route_max_cost"} and charges nothing.
//     accept: application/json
//   body: none. Apollo catalogue endpoints take query-string params on a POST, arrays as
//   `field[]=value` repeated (e.g. `person_titles[]=head%20of%20marketing&per_page=5`).
//
// Response (verbatim upstream body; Treg adds headers):
//   X-Treg-Cost-Micro: <integer micro-USD actually charged>   (missing → treated as 0)
//   X-Treg-Call-Id:    <call id>                              (optional)
//   apollo.people.search body:
//     { "people": [ { "id": "60ed…", "first_name": "Kanchan", "last_name_obfuscated": "Be***i",
//                     "title": "Head of Marketing", "organization": { "name": "Stripe" } } ],
//       "total_entries": 123 }
//   apollo.companies.search body:
//     { "organizations": [ { "id": "5d0a…", "name": "Stripe", "website_url": "http://www.stripe.com",
//                            "primary_domain": "stripe.com" } ] }
//   apollo.companies.news body:
//     { "news_articles": [ { "id": "…", "url": "…", "title": "…", "organization_ids": ["…"] } ] }
//
// Confirmed from https://treg.to/llms.txt and https://treg.to/catalog/endpoints/<id> (2026-10-15):
// /call/<id>, X-Treg-Token, X-Treg-Cost-Micro (integer micro-USD), X-Treg-Route-Max-Cost in USD
// with 402 route_max_cost refusal, POST + query-string params for Apollo, response shapes above.
// Assumed: 402 out-of-balance and route_max_cost both surface as non-2xx with no charge header.

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export type TregParamValue = string | number | string[]
export type TregParams = Record<string, TregParamValue>

export class TregUnavailableError extends Error {
  readonly code = 'treg_unavailable' as const
  constructor(message: string) {
    super(message)
    this.name = 'TregUnavailableError'
  }
}

export class TregCallError extends Error {
  readonly code = 'treg_call_failed' as const
  constructor(
    message: string,
    readonly status: number,
    readonly costMicro: number,
    readonly refusedOverCap: boolean,
  ) {
    super(message)
    this.name = 'TregCallError'
  }
}

export interface TregClientOptions {
  token: string
  baseUrl?: string
  fetch?: FetchLike
}

export interface TregCallResult {
  body: unknown
  costMicro: number
  callId: string | null
}

export interface TregClient {
  call(endpointId: string, params: TregParams, maxCostMicro: number): Promise<TregCallResult>
}

export function tregBaseUrl(): string {
  return (process.env.TREG_BASE_URL ?? 'https://treg.to').replace(/\/+$/, '')
}

export function microToUsd(micro: number): string {
  return (micro / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0')
}

export function buildQuery(params: TregParams): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      const arrayKey = key.endsWith('[]') ? key : `${key}[]`
      for (const item of value) search.append(arrayKey, item)
    } else {
      search.append(key, String(value))
    }
  }
  return search.toString()
}

function readCost(response: Response): number {
  const raw = response.headers.get('x-treg-cost-micro')
  if (!raw) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function createTregClient(options: TregClientOptions): TregClient {
  const baseUrl = (options.baseUrl ?? tregBaseUrl()).replace(/\/+$/, '')
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init))
  return {
    async call(endpointId, params, maxCostMicro) {
      const query = buildQuery(params)
      const url = `${baseUrl}/call/${endpointId}${query ? `?${query}` : ''}`
      const response = await doFetch(url, {
        method: 'POST',
        headers: {
          'X-Treg-Token': options.token,
          'X-Treg-Route-Max-Cost': microToUsd(maxCostMicro),
          accept: 'application/json',
        },
      })
      const costMicro = readCost(response)
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const refusedOverCap = response.status === 402 && text.includes('route_max_cost')
        throw new TregCallError(
          `Treg ${endpointId} failed (${response.status}): ${text.slice(0, 200)}`,
          response.status,
          costMicro,
          refusedOverCap,
        )
      }
      const body: unknown = await response.json()
      return { body, costMicro, callId: response.headers.get('x-treg-call-id') }
    },
  }
}
