import type { EventRow } from '../../api'

export interface InvoiceEvidence {
  quote: string
  memoryFact: string
  clauses: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function evidenceFromEvent(event: EventRow | undefined): InvoiceEvidence[] {
  if (!event) return []
  try {
    const value: unknown = JSON.parse(event.data_json)
    if (!isRecord(value) || !isRecord(value.decision) || !Array.isArray(value.decision.lines)) return []
    return value.decision.lines.flatMap((line): InvoiceEvidence[] => {
      if (!isRecord(line)
        || typeof line.quote !== 'string'
        || typeof line.memoryFact !== 'string'
        || !Array.isArray(line.clauses)) return []
      const clauses = line.clauses.filter((clause): clause is string => typeof clause === 'string')
      if (clauses.length !== line.clauses.length) return []
      return [{ quote: line.quote, memoryFact: line.memoryFact, clauses }]
    })
  } catch {
    return []
  }
}
