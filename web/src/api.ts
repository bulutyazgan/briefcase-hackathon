export interface ChannelMessage {
  id: string
  channel: string
  thread: string
  author: string
  text: string
  ts: string
  processed_at: string | null
}

export interface EventRow {
  id: string
  message_id: string
  step: string
  summary: string
  data_json: string
  policy_clause: string | null
  created_at: string
}

export interface InvoiceRow {
  id: string
  message_id: string
  stripe_invoice_id: string | null
  client_id: string | null
  total_pence: number
  status: string
  hosted_url: string | null
  pdf_path: string | null
  created_at: string
}

export interface ApprovalRow {
  id: string
  message_id: string
  status: string
  reason: string
}

export interface AppState {
  messages: ChannelMessage[]
  invoices: InvoiceRow[]
  approvals: ApprovalRow[]
  events: EventRow[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isAppState(value: unknown): value is AppState {
  if (!isRecord(value)) return false
  return Array.isArray(value.messages)
    && Array.isArray(value.invoices)
    && Array.isArray(value.approvals)
    && Array.isArray(value.events)
}

export async function fetchState(): Promise<AppState> {
  const response = await fetch('/api/state')
  if (!response.ok) throw new Error(`State request failed (${response.status}).`)
  const payload: unknown = await response.json()
  if (!isAppState(payload)) throw new Error('The server returned an invalid state response.')
  return payload
}
