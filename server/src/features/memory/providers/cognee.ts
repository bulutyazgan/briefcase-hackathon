// Cognee Cloud HTTP client. One dataset per client (datasetName(clientName)).
// Base URL comes only from COGNEE_BASE_URL; every request sends header `X-Api-Key`.
//
// POST {base}/api/v1/add       multipart/form-data:
//                                data        = one text file (a tagged fact, see memory.ts encodeFact)
//                                datasetName = "<client-slug>"
//                              response: any 2xx (body ignored)
// POST {base}/api/v1/cognify   JSON { "datasets": ["<client-slug>"], "run_in_background": true }
//                              response: any 2xx (body ignored)
// POST {base}/api/v1/search    JSON { "query": "...", "search_type": "CHUNKS",
//                                     "datasets": ["<client-slug>"], "top_k": 20 }
//                              response: any JSON; every string leaf is scanned for
//                              tagged facts "[date=YYYY-MM-DD role=<role> source=<id> client=<slug>] text".
//                              e.g. [{ "search_result": ["[date=... ] Pays on 7-day terms"] }]
// Non-2xx responses throw.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface CogneeConfig {
  apiKey: string
  baseUrl: string
  fetch?: FetchLike
}

export interface CogneeClient {
  add(dataset: string, text: string): Promise<void>
  cognify(dataset: string): Promise<void>
  search(dataset: string, query: string): Promise<string[]>
}

export function cogneeConfigFromEnv(): CogneeConfig | null {
  const apiKey = process.env.COGNEE_API_KEY
  const baseUrl = process.env.COGNEE_BASE_URL
  if (!apiKey || !baseUrl) return null
  return { apiKey, baseUrl }
}

export function datasetName(clientName: string): string {
  return clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Cognee responses vary by search type and version; collect every string leaf.
export function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectStrings)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(collectStrings)
  return []
}

export function createCogneeClient(config: CogneeConfig): CogneeClient {
  const doFetch: FetchLike = config.fetch ?? ((input, init) => fetch(input, init))
  const root = config.baseUrl.replace(/\/$/, '')

  async function call(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('X-Api-Key', config.apiKey)
    const response = await doFetch(`${root}${path}`, { ...init, headers })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Cognee ${path} failed (${response.status}). ${detail.slice(0, 200)}`)
    }
    return response
  }

  return {
    async add(dataset, text) {
      const body = new FormData()
      body.append('data', new Blob([text], { type: 'text/plain' }), `${crypto.randomUUID()}.txt`)
      body.set('datasetName', dataset)
      await call('/api/v1/add', { method: 'POST', body })
    },
    async cognify(dataset) {
      await call('/api/v1/cognify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ datasets: [dataset], run_in_background: true }),
      })
    },
    async search(dataset, query) {
      const response = await call('/api/v1/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, search_type: 'CHUNKS', datasets: [dataset], top_k: 20 }),
      })
      return collectStrings(await response.json())
    },
  }
}
