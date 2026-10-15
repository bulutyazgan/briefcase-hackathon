import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { MemoryFact } from '../policy/decide'

const seedSchema = z.object({
  clients: z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    aliases: z.array(z.string()),
  })),
  facts: z.array(z.object({
    clientId: z.string(),
    fact: z.string(),
    date: z.string(),
  })),
})

export interface Client {
  id: string
  name: string
  email: string
}

const memorySeed = seedSchema.parse(JSON.parse(
  readFileSync(new URL('../../../seed/memory.json', import.meta.url), 'utf8'),
))

export function findClient(name: string): Client | null {
  const normalizedName = name.trim().toLowerCase()
  const client = memorySeed.clients.find((candidate) =>
    [candidate.name, ...candidate.aliases].some((entry) => entry.toLowerCase() === normalizedName),
  )
  return client ? { id: client.id, name: client.name, email: client.email } : null
}

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

export async function recallSeededFacts(clientName: string): Promise<MemoryFact[]> {
  const client = findClient(clientName)
  if (!client) return []
  return memorySeed.facts
    .filter((entry) => entry.clientId === client.id)
    .map(({ fact, date }) => ({ fact, date }))
}

export async function recallFacts(clientName: string, query: string): Promise<MemoryFact[]> {
  const client = findClient(clientName)
  if (!client) return []
  const apiKey = process.env.COGNEE_API_KEY
  const baseUrl = process.env.COGNEE_BASE_URL
  if (!apiKey || !baseUrl) return recallSeededFacts(clientName)

  const result = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({
      query,
      search_type: 'GRAPH_COMPLETION',
      datasets: [datasetName(client.id)],
    }),
  })
  if (!result.ok) throw new Error(`Cognee search failed (${result.status}).`)
  return readCogneeFacts(await result.json())
}

export async function rememberFact(clientName: string, fact: string): Promise<void> {
  const client = findClient(clientName)
  if (!client) return
  const apiKey = process.env.COGNEE_API_KEY
  const baseUrl = process.env.COGNEE_BASE_URL
  if (!apiKey || !baseUrl) return
  const body = new FormData()
  body.set('raw_data', fact)
  body.set('datasetName', datasetName(client.id))
  const result = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/remember`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body,
  })
  if (!result.ok) throw new Error(`Cognee remember failed (${result.status}).`)
}
