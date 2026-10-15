import { z } from 'zod'
import type { MemoryFact } from '../policy/decide'

const seededFactsSchema = z.array(z.object({
  clientName: z.string(),
  fact: z.string(),
  date: z.string(),
}))

function datasetName(clientName: string): string {
  return clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readCogneeFacts(value: unknown): MemoryFact[] {
  if (!isRecord(value)) return []
  const root = value
  const candidates = root.facts ?? root.results ?? root.data
  if (!Array.isArray(candidates)) return []
  return candidates.flatMap((item): MemoryFact[] => {
    if (!isRecord(item)) return []
    const entry = item
    const fact = entry.fact ?? entry.text ?? entry.content
    const date = entry.date ?? entry.created_at ?? entry.timestamp
    if (typeof fact !== 'string') return []
    return [{ fact, date: typeof date === 'string' ? date.slice(0, 10) : 'Cognee memory' }]
  })
}

async function seededFacts() {
  const contents = await Bun.file(new URL('../../../seed/memory.json', import.meta.url)).text()
  return seededFactsSchema.parse(JSON.parse(contents))
}

export async function canonicalClientName(clientName: string): Promise<string> {
  const requestedName = clientName.trim().toLowerCase()
  const knownNames = [...new Set((await seededFacts()).map((entry) => entry.clientName))]
  return knownNames.find((knownName) => {
    const normalizedKnownName = knownName.toLowerCase()
    return normalizedKnownName === requestedName || normalizedKnownName.startsWith(`${requestedName} `)
  }) ?? clientName
}

export async function recallSeededFacts(clientName: string): Promise<MemoryFact[]> {
  const canonicalName = await canonicalClientName(clientName)
  return (await seededFacts())
    .filter((entry) => entry.clientName.toLowerCase() === canonicalName.toLowerCase())
    .map(({ fact, date }) => ({ fact, date }))
}

export async function recallFacts(clientName: string, query: string): Promise<MemoryFact[]> {
  const apiKey = process.env.COGNEE_API_KEY
  const baseUrl = process.env.COGNEE_BASE_URL
  if (!apiKey || !baseUrl) return recallSeededFacts(clientName)

  const canonicalName = await canonicalClientName(clientName)
  const result = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({
      query,
      search_type: 'GRAPH_COMPLETION',
      datasets: [datasetName(canonicalName)],
    }),
  })
  if (!result.ok) throw new Error(`Cognee search failed (${result.status}).`)
  return readCogneeFacts(await result.json())
}

export async function rememberFact(clientName: string, fact: string): Promise<void> {
  const apiKey = process.env.COGNEE_API_KEY
  const baseUrl = process.env.COGNEE_BASE_URL
  if (!apiKey || !baseUrl) return
  const body = new FormData()
  body.set('raw_data', fact)
  body.set('datasetName', datasetName(clientName))
  const result = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/remember`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body,
  })
  if (!result.ok) throw new Error(`Cognee remember failed (${result.status}).`)
}
