import { listEventsByStep, recordEvent, type EventRow } from '../ledger/store'
import { postSlackText } from '../channels/slack'
import { postTelegramText } from '../channels/telegram'

// Staff channel: humans get a note for every autonomous change, not a form.
// Each note is a ledger event (step 'staff_note', the one durable writer) and,
// when a staff channel is configured, a post to it. Louis's Notifications page
// renders the same events.

export const STAFF_NOTE_STEP = 'staff_note'

export const staffNoteKinds = ['invoice', 'approval', 'credit_note', 'payment', 'offer', 'kill_switch', 'reminder', 'plan_change', 'note'] as const
export type StaffNoteKind = typeof staffNoteKinds[number]

export interface StaffNote {
  id: string
  messageId: string
  kind: StaffNoteKind
  text: string
  clauses: string[]
  createdAt: string
}

// Supplier, gateway and memory vendor names stay in the internal audit log; a note never carries them.
const PROVIDER_NAMES = ['treg', 'cognee', 'firecrawl', 'apollo', 'openai', 'fireworks'] as const
const providerPattern = new RegExp(`\\b(${PROVIDER_NAMES.join('|')})\\b`, 'gi')

export function redactProviderNames(text: string): string {
  return text.replace(providerPattern, 'our supplier')
}

export function containsProviderName(text: string): boolean {
  return new RegExp(providerPattern.source, 'i').test(text)
}

export function money(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function isKind(value: unknown): value is StaffNoteKind {
  return typeof value === 'string' && (staffNoteKinds as readonly string[]).includes(value)
}

function noteFromEvent(event: EventRow): StaffNote {
  let kind: StaffNoteKind = 'note'
  try {
    const parsed: unknown = JSON.parse(event.data_json)
    if (parsed && typeof parsed === 'object' && 'kind' in parsed && isKind(parsed.kind)) kind = parsed.kind
  } catch {
    kind = 'note'
  }
  return {
    id: event.id,
    messageId: event.message_id,
    kind,
    text: event.summary,
    clauses: event.policy_clause ? event.policy_clause.split(',').filter(Boolean) : [],
    createdAt: event.created_at,
  }
}

// Posts to whichever staff channel is configured. Both are optional; a missing one is a no-op, a failing one is logged.
async function postToStaffChannels(text: string): Promise<void> {
  const slackChannel = process.env.STAFF_SLACK_CHANNEL?.trim()
  const telegramChatId = process.env.STAFF_TELEGRAM_CHAT_ID?.trim()
  await Promise.all([
    slackChannel ? postSlackText(slackChannel, text).catch((error: unknown) => console.error(`Staff note to Slack failed: ${String(error)}`)) : Promise.resolve(),
    telegramChatId ? postTelegramText(telegramChatId, text).catch((error: unknown) => console.error(`Staff note to Telegram failed: ${String(error)}`)) : Promise.resolve(),
  ])
}

// Records the note first (synchronously, so a crash mid-post still leaves the record), then posts it.
export function noteToStaff(messageId: string, kind: StaffNoteKind, text: string, clauses: string[]): Promise<StaffNote> {
  const safeText = redactProviderNames(text)
  const note: StaffNote = {
    id: crypto.randomUUID(),
    messageId,
    kind,
    text: safeText,
    clauses,
    createdAt: new Date().toISOString(),
  }
  recordEvent({
    id: note.id,
    message_id: messageId,
    step: STAFF_NOTE_STEP,
    summary: safeText,
    data_json: JSON.stringify({ kind }),
    policy_clause: clauses.length ? clauses.join(',') : null,
  })
  return postToStaffChannels(`Tally: ${safeText}${clauses.length ? ` (${clauses.join(', ')})` : ''}`).then(() => note)
}

export function listStaffNotes(): StaffNote[] {
  return listEventsByStep(STAFF_NOTE_STEP).map(noteFromEvent).reverse()
}
