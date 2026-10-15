export type OpportunityStatus = 'spotted' | 'offered' | 'accepted' | 'declined' | 'expired'

export type OpportunityEvidence =
  | { kind: 'cadence'; facts: string[]; lastDelivered: string; daysSince: number }
  | { kind: 'channel'; quote: string; messageId: string }
  | { kind: 'signal'; accountIds: string[]; count: number }

export interface OpportunityView {
  id: string
  clientName: string
  service: string
  quantity: number
  pricePence: number
  discountNote: string
  rationale: string
  evidence: OpportunityEvidence
  status: OpportunityStatus
  clauses: string[]
  thread: string | null
  spottedAt: string
  expiresAt: string | null
  invoiceId: string | null
  gateEvents: Array<{ clause: string; summary: string; at: string }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isOpportunity(value: unknown): value is OpportunityView {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.clientName === 'string'
    && typeof value.pricePence === 'number'
    && typeof value.status === 'string'
    && isRecord(value.evidence)
    && Array.isArray(value.clauses)
    && Array.isArray(value.gateEvents)
}

export async function fetchOpportunities(): Promise<OpportunityView[]> {
  const response = await fetch('/api/opportunities')
  if (!response.ok) throw new Error(`Opportunities request failed (${response.status}).`)
  const payload: unknown = await response.json()
  if (!isRecord(payload) || !Array.isArray(payload.opportunities)) throw new Error('The server returned an invalid opportunities response.')
  return payload.opportunities.filter(isOpportunity)
}
