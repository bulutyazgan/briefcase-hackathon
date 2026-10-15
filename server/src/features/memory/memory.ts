import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { MemoryFact } from '../policy/decide'
import {
  cogneeConfigFromEnv,
  createCogneeClient,
  datasetName,
  type CogneeClient,
} from './providers/cognee'

// One shared customer memory, read and written by three agent roles.
export const memoryRoles = ['sales', 'billing', 'collections'] as const
export type MemoryRole = typeof memoryRoles[number]

export interface RoleFact extends MemoryFact {
  clientName: string
  role: MemoryRole
  sourceMessageId: string
}

export interface MemoryOptions {
  // null forces the local fallback; undefined reads COGNEE_API_KEY from env.
  cognee?: CogneeClient | null
  now?: Date
}

const roleSchema = z.enum(memoryRoles)
const UUID_PATTERN = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i
const seededFactsSchema = z.array(z.object({
  clientName: z.string(),
  fact: z.string(),
  date: z.string(),
  role: roleSchema,
  sourceMessageId: z.string(),
}))

// Facts remembered in this process. Cognee cognify is asynchronous, so a fact
// written a moment ago must still be recallable before the graph catches up.
const sessionFacts: RoleFact[] = []

export function clearSessionFacts(): void {
  sessionFacts.length = 0
}

function resolveCognee(options: MemoryOptions): CogneeClient | null {
  if (options.cognee !== undefined) return options.cognee
  const config = cogneeConfigFromEnv()
  return config ? createCogneeClient(config) : null
}

// Facts are stored in Cognee as tagged text so role, date and source survive search.
export function encodeFact(fact: RoleFact): string {
  return `[date=${fact.date} role=${fact.role} source=${fact.sourceMessageId} client=${datasetName(fact.clientName)}] ${fact.fact.replace(/\s+/g, ' ').trim()}`
}

const taggedFactPattern = /\[date=(\S+) role=(sales|billing|collections) source=(\S+) client=(\S+)\]\s*([^[\n]+)/g

export function decodeFacts(text: string, clientName: string): RoleFact[] {
  const facts: RoleFact[] = []
  for (const match of text.matchAll(taggedFactPattern)) {
    const [, date, role, sourceMessageId, client, fact] = match
    const parsedRole = roleSchema.safeParse(role)
    if (!date || !sourceMessageId || !fact || !parsedRole.success) continue
    if (client !== datasetName(clientName)) continue
    facts.push({ clientName, date, role: parsedRole.data, sourceMessageId, fact: fact.trim() })
  }
  return facts
}

async function seededFacts(): Promise<RoleFact[]> {
  const contents = await Bun.file(new URL('../../../seed/memory.json', import.meta.url)).text()
  return seededFactsSchema.parse(JSON.parse(contents))
}

export async function knownClientNames(): Promise<string[]> {
  return [...new Set((await seededFacts()).map((entry) => entry.clientName))]
}

export async function canonicalClientName(clientName: string): Promise<string> {
  const requestedName = clientName.trim().toLowerCase()
  const knownNames = await knownClientNames()
  return knownNames.find((knownName) => {
    const normalizedKnownName = knownName.toLowerCase()
    return normalizedKnownName === requestedName || normalizedKnownName.startsWith(`${requestedName} `)
  }) ?? clientName
}

function sameClient(a: string, b: string): boolean {
  return datasetName(a) === datasetName(b)
}

function dedupe(facts: RoleFact[]): RoleFact[] {
  const seen = new Set<string>()
  return facts.filter((entry) => {
    const key = `${entry.role}|${entry.date}|${entry.fact.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function remember(
  clientName: string,
  role: MemoryRole,
  fact: string,
  sourceMessageId: string,
  options: MemoryOptions = {},
): Promise<RoleFact> {
  const canonicalName = await canonicalClientName(clientName)
  const entry: RoleFact = {
    clientName: canonicalName,
    role,
    fact,
    sourceMessageId,
    date: (options.now ?? new Date()).toISOString().slice(0, 10),
  }
  sessionFacts.push(entry)
  const cognee = resolveCognee(options)
  if (cognee) {
    const dataset = datasetName(canonicalName)
    await cognee.add(dataset, encodeFact(entry))
    await cognee.cognify(dataset)
  }
  return entry
}

export async function storeInCogneeDataset(dataset: string, text: string): Promise<boolean> {
  const cognee = resolveCognee({})
  if (!cognee) return false
  await cognee.add(dataset, text)
  await cognee.cognify(dataset)
  return true
}

export async function searchCogneeDataset(
  dataset: string,
  query: string,
  options: { topK?: number; timeoutMs?: number } = {},
): Promise<string[] | null> {
  const cognee = resolveCognee({})
  if (!cognee) return null
  const topK = Math.min(5, options.topK ?? 5)
  const hits = await cognee.search(dataset, query, {
    topK,
    signal: AbortSignal.timeout(options.timeoutMs ?? 4000),
  })
  const seen = new Set<string>()
  const filtered: string[] = []
  for (const rawHit of hits) {
    const hit = rawHit.trim()
    const key = hit.replace(/\s+/g, ' ').toLowerCase()
    if (hit.length < 40 || UUID_PATTERN.test(hit) || seen.has(key)) continue
    seen.add(key)
    filtered.push(hit)
    if (filtered.length >= topK) break
  }
  return filtered
}

export async function seedClientMemoryToCognee(clientName: string): Promise<boolean> {
  const cognee = resolveCognee({})
  if (!cognee) return false
  const facts = (await seededFacts()).filter((entry) => sameClient(entry.clientName, clientName))
  if (!facts.length) return false
  const dataset = datasetName(clientName)
  await Promise.all(facts.map((fact) => cognee.add(dataset, encodeFact(fact))))
  await cognee.cognify(dataset)
  return true
}

export async function recall(
  clientName: string,
  query: string,
  role?: MemoryRole,
  options: MemoryOptions = {},
): Promise<RoleFact[]> {
  const canonicalName = await canonicalClientName(clientName)
  const local = [
    ...(await seededFacts()),
    ...sessionFacts,
  ].filter((entry) => sameClient(entry.clientName, canonicalName))
  const cognee = resolveCognee(options)
  const remote = cognee
    ? (await cognee.search(datasetName(canonicalName), query)).flatMap((text) => decodeFacts(text, canonicalName))
    : []
  return dedupe([...local, ...remote])
    .filter((entry) => !role || entry.role === role)
    .map((entry) => ({ ...entry, clientName: canonicalName }))
}

// Thin wrappers kept for existing callers in agent.ts.
export async function recallSeededFacts(clientName: string): Promise<MemoryFact[]> {
  const canonicalName = await canonicalClientName(clientName)
  return (await seededFacts()).filter((entry) => sameClient(entry.clientName, canonicalName))
}

export async function recallFacts(clientName: string, query: string): Promise<MemoryFact[]> {
  return recall(clientName, query)
}

export async function rememberFact(
  clientName: string,
  fact: string,
  role: MemoryRole = 'billing',
  sourceMessageId = 'unknown',
): Promise<void> {
  await remember(clientName, role, fact, sourceMessageId)
}
