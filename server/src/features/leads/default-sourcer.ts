import { seedLeads, sourceLeads, type Lead } from './leads'
import type { SourcedLead, Sourcer } from './sourcing'

function toSourced(leads: Lead[], provider: string, quantity: number): SourcedLead[] {
  return leads.slice(0, quantity).map((lead) => ({
    ...lead,
    id: crypto.randomUUID(),
    provider,
    costMicro: 0,
  }))
}

// Wraps the Firecrawl search with the seeded CSV as fallback. Costs nothing,
// so P9 is trivially met. The Treg sourcer replaces this in agent.ts.
export const defaultSourcer: Sourcer = async (request) => {
  const usesFirecrawl = Boolean(process.env.FIRECRAWL_API_KEY)
  try {
    const leads = await sourceLeads(request.icp, request.quantity)
    const source = usesFirecrawl ? 'firecrawl' : 'seed'
    return {
      leads: toSourced(leads, source, request.quantity),
      costMicro: 0,
      calls: [{ endpointId: source, accepted: true, reason: 'Free search source.', costMicro: 0, clauses: ['P9'] }],
      source,
    }
  } catch (error) {
    const leads = await seedLeads()
    return {
      leads: toSourced(leads, 'seed', request.quantity),
      costMicro: 0,
      calls: [{ endpointId: 'seed', accepted: true, reason: `Search failed (${String(error)}); used seed list.`, costMicro: 0, clauses: ['P9'] }],
      source: 'seed',
    }
  }
}
