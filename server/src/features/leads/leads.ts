import { z } from 'zod'

export interface Lead {
  name: string
  company: string
  url: string
}

const leadResultSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  description: z.string().optional(),
})

const firecrawlResultSchema = z.object({
  data: z.union([
    z.array(leadResultSchema),
    z.object({ web: z.array(leadResultSchema).optional() }),
  ]).optional(),
  results: z.array(leadResultSchema).optional(),
})

function parseSeedCsv(csv: string): Lead[] {
  return csv.trim().split('\n').slice(1).flatMap((row) => {
    const [name, company, url] = row.split(',')
    if (!name || !company || !url) return []
    return [{ name, company, url }]
  })
}

export async function seedLeads(): Promise<Lead[]> {
  const csv = await Bun.file(new URL('../../../seed/leads.csv', import.meta.url)).text()
  return parseSeedCsv(csv)
}

export async function sourceLeads(icp: string, quantity: number): Promise<Lead[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return seedLeads()

  const response = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: icp, limit: Math.min(quantity, 100) }),
  })
  if (!response.ok) throw new Error(`Firecrawl search failed (${response.status}).`)
  const parsed = firecrawlResultSchema.parse(await response.json())
  const results = Array.isArray(parsed.data)
    ? parsed.data
    : parsed.data?.web ?? parsed.results ?? []
  return results.flatMap((result) => {
    if (!result.title || !result.url) return []
    return [{
      name: result.title,
      company: result.title.split(/[|—–-]/)[0]?.trim() ?? result.title,
      url: result.url,
    }]
  })
}

export function leadsCsv(leads: Lead[]): string {
  return [
    'name,company,url',
    ...leads.map((lead) => [lead.name, lead.company, lead.url]
      .map((value) => `"${value.replaceAll('"', '""')}"`).join(',')),
  ].join('\n')
}
