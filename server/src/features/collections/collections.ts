import { z } from 'zod'
import {
  getMessage,
  listEvents,
  listOpenInvoices,
  recordEvent,
  type EventRow,
  type InvoiceRow,
} from '../ledger/store'
import { reply } from '../channels/channel'
import { recall, type RoleFact } from '../memory/memory'
import { extractSignals, type SignalExtractor } from './signals'

// Collections role: chases past-due invoices, at most once per 24 h, never on a
// remembered dispute or before a promised payment date (P7). Code decides.

export const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000
export const DEFAULT_TERMS_DAYS = 14
export const REMINDER_STEP = 'collections_reminder'
export const SKIP_STEP = 'collections_skip'

export interface LastEvent {
  at: Date
  reason: string
}

export interface CollectionsDeps {
  listOpenInvoices(): InvoiceRow[]
  clientNameFor(invoice: InvoiceRow): string | null
  recall(clientName: string): Promise<RoleFact[]>
  extractSignals: SignalExtractor
  lastEvent(invoice: InvoiceRow, step: string): LastEvent | null
  recordEvent(event: Omit<EventRow, 'created_at'>): void
  sendReminder(invoice: InvoiceRow, text: string): Promise<void>
}

export type CollectionsOutcome =
  | { invoiceId: string; action: 'reminded'; text: string }
  | { invoiceId: string; action: 'skipped'; reason: string }
  | { invoiceId: string; action: 'not_due' | 'throttled' | 'unknown_client' }

const eventDataSchema = z.object({ at: z.string(), reason: z.string().optional() })
const decideDataSchema = z.object({ intent: z.object({ clientName: z.string() }) })

function parseDbDate(value: string): Date {
  // SQLite datetime('now') is UTC without a zone marker.
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}Z`)
}

export function termsDays(facts: RoleFact[]): { days: number; fact: RoleFact | null } {
  for (const fact of facts) {
    const match = fact.fact.match(/(\d{1,3})-day terms/i)
    if (match?.[1]) return { days: Number(match[1]), fact }
  }
  return { days: DEFAULT_TERMS_DAYS, fact: null }
}

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function cite(fact: RoleFact): string {
  return `“${fact.fact}” (${fact.role}, ${fact.date}, source ${fact.sourceMessageId})`
}

export function reminderText(invoice: InvoiceRow, dueDate: Date, terms: RoleFact | null, facts: RoleFact[]): string {
  const agreed = facts.filter((entry) => entry.role === 'sales' && /agreed/i.test(entry.fact))
  return [
    `Friendly reminder: invoice ${invoice.stripe_invoice_id ?? invoice.id} for ${formatPence(invoice.total_pence)} was due on ${dueDate.toISOString().slice(0, 10)}.`,
    terms ? `As agreed, you pay on these terms: ${cite(terms)}.` : `Our standard terms are ${DEFAULT_TERMS_DAYS} days.`,
    ...agreed.map((entry) => `Pricing as agreed: ${cite(entry)}.`),
    invoice.hosted_url ? `Pay here: ${invoice.hosted_url}` : '',
  ].filter(Boolean).join('\n')
}

const defaultDeps: CollectionsDeps = {
  listOpenInvoices,
  clientNameFor(invoice) {
    const decide = listEvents(invoice.message_id).find((event) => event.step === 'decide')
    if (!decide) return null
    const parsed = decideDataSchema.safeParse(JSON.parse(decide.data_json))
    return parsed.success ? parsed.data.intent.clientName : null
  },
  recall: (clientName) => recall(clientName, 'payment terms, disputes, promises to pay, agreed pricing'),
  extractSignals,
  lastEvent(invoice, step) {
    const event = listEvents(invoice.message_id).find((entry) => entry.step === step)
    if (!event) return null
    const parsed = eventDataSchema.safeParse(JSON.parse(event.data_json))
    if (!parsed.success) return { at: parseDbDate(event.created_at), reason: '' }
    return { at: new Date(parsed.data.at), reason: parsed.data.reason ?? '' }
  },
  recordEvent,
  async sendReminder(invoice, text) {
    const message = getMessage(invoice.message_id)
    if (message) await reply(message, text)
  },
}

export async function runCollectionsTick(
  now: Date,
  overrides: Partial<CollectionsDeps> = {},
): Promise<CollectionsOutcome[]> {
  const deps: CollectionsDeps = { ...defaultDeps, ...overrides }
  const outcomes: CollectionsOutcome[] = []

  for (const invoice of deps.listOpenInvoices()) {
    if (invoice.status !== 'open') continue
    const clientName = deps.clientNameFor(invoice)
    if (!clientName) {
      outcomes.push({ invoiceId: invoice.id, action: 'unknown_client' })
      continue
    }
    const facts = await deps.recall(clientName)
    const terms = termsDays(facts)
    const dueDate = new Date(parseDbDate(invoice.created_at).getTime() + terms.days * 86400000)
    if (now.getTime() <= dueDate.getTime()) {
      outcomes.push({ invoiceId: invoice.id, action: 'not_due' })
      continue
    }

    const signals = await deps.extractSignals(facts)
    const today = now.toISOString().slice(0, 10)
    const dispute = signals.disputes[0]
    const promise = signals.promises.find((entry) => entry.promisedDate > today)
    const skip = dispute
      ? { reason: 'dispute', summary: `Skipped reminder: ${clientName} has a remembered dispute ${cite(dispute.fact)}.`, fact: dispute.fact }
      : promise
        ? { reason: `promise:${promise.promisedDate}`, summary: `Skipped reminder: ${clientName} promised to pay on ${promise.promisedDate} ${cite(promise.fact)}.`, fact: promise.fact }
        : null

    if (skip) {
      // Log a skip once per reason per 24 h so the timeline is not flooded every tick.
      const last = deps.lastEvent(invoice, SKIP_STEP)
      if (!last || last.reason !== skip.reason || now.getTime() - last.at.getTime() >= REMINDER_INTERVAL_MS) {
        deps.recordEvent({
          id: crypto.randomUUID(),
          message_id: invoice.message_id,
          step: SKIP_STEP,
          summary: skip.summary,
          data_json: JSON.stringify({ at: now.toISOString(), reason: skip.reason, invoiceId: invoice.id, clientName, fact: skip.fact, model: signals.model }),
          policy_clause: 'P7',
        })
      }
      outcomes.push({ invoiceId: invoice.id, action: 'skipped', reason: skip.reason })
      continue
    }

    const lastReminder = deps.lastEvent(invoice, REMINDER_STEP)
    if (lastReminder && now.getTime() - lastReminder.at.getTime() < REMINDER_INTERVAL_MS) {
      outcomes.push({ invoiceId: invoice.id, action: 'throttled' })
      continue
    }

    const text = reminderText(invoice, dueDate, terms.fact, facts)
    await deps.sendReminder(invoice, text)
    deps.recordEvent({
      id: crypto.randomUUID(),
      message_id: invoice.message_id,
      step: REMINDER_STEP,
      summary: `Sent a payment reminder to ${clientName} citing the agreed terms.`,
      data_json: JSON.stringify({ at: now.toISOString(), reason: 'past_due', invoiceId: invoice.id, clientName, dueDate: dueDate.toISOString(), terms: terms.fact, text }),
      policy_clause: 'P7',
    })
    outcomes.push({ invoiceId: invoice.id, action: 'reminded', text })
  }
  return outcomes
}
