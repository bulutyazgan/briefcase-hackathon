import type { EventRow } from '../../api'
import { isReadOnlyMode } from '../../app-state'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function simulateInvoicePayment(invoiceId: string): Promise<void> {
  if (isReadOnlyMode()) throw new Error('This demo is read-only.')
  const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/simulate-payment`, {
    method: 'POST',
  })
  if (response.ok) return
  const payload: unknown = await response.json()
  const message = isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : `Test payment failed (${response.status}).`
  throw new Error(message)
}

export interface InvoiceEvidence {
  quote: string
  memoryFact: string
  clauses: string[]
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
