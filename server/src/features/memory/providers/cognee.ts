// Cognee Cloud HTTP client. One dataset per client (datasetName(clientName)).
// Base URL comes only from COGNEE_BASE_URL; every request sends header `X-Api-Key`.
//
// POST {base}/api/v1/remember multipart/form-data (verified against Cognee Cloud, 15 Oct 2026):
//                                raw_data          = the tagged fact text (see memory.ts encodeFact)
//                                datasetName       = "<client-slug>"
//                                run_in_background = "false"   (indexed before the call returns)
//                              response: any 2xx (body ignored)
// POST {base}/api/v1/cognify   JSON { "datasets": ["<client-slug>"], "run_in_background": true }
//                              response: any 2xx (body ignored); kept for datasets added another way
// POST {base}/api/v1/search    JSON { "query": "...", "searchType": "CHUNKS",
//                                     "datasets": ["<client-slug>"], "topK": 20 }
//                              response: any JSON; text and content fields hold
//                              the searchable result strings.
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
  search(dataset: string, query: string, options?: { topK?: number; signal?: AbortSignal }): Promise<string[]>
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

function collectSearchText(value: unknown, allowStrings = false): string[] {
  if (typeof value === 'string') return allowStrings ? [value] : []
  if (Array.isArray(value)) return value.flatMap((entry) => collectSearchText(entry, allowStrings))
  if (value === null || typeof value !== 'object') return []
  const entries = Object.entries(value)
  const resultText = entries.find(([key, entry]) =>
    (key === 'text' || key === 'content') && typeof entry === 'string',
  )?.[1]
  if (typeof resultText === 'string') return [resultText]
  return entries.flatMap(([key, entry]) =>
    collectSearchText(entry, key === 'search_result' || key === 'search_results' || key === 'results'),
  )
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
      body.set('raw_data', text)
      body.set('datasetName', dataset)
      body.set('run_in_background', 'false')
      await call('/api/v1/remember', { method: 'POST', body })
    },
    async cognify(dataset) {
      await call('/api/v1/cognify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ datasets: [dataset], run_in_background: true }),
      })
    },
    async search(dataset, query, options = {}) {
      const response = await call('/api/v1/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, searchType: 'CHUNKS', datasets: [dataset], topK: options.topK ?? 20 }),
        signal: options.signal,
      })
      return collectSearchText(await response.json())
    },
  }
}
