import type { EventRow } from '../../api'

export function auditEvents(events: EventRow[]): EventRow[] {
  return [...events].sort((first, second) => second.created_at.localeCompare(first.created_at))
}
