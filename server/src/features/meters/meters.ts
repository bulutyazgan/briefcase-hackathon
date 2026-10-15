import { z } from 'zod'
import { getStripe } from '../billing/billing'
import type { SourcedLead } from '../leads/sourcing'
import { getInvoice, listStepEvents, recordEvent, recordEventOnce } from '../ledger/store'

// Layer B: pay per qualified lead. The one-off invoice stays the money path; each
// qualified lead also sends one Stripe meter event so every pound maps to one lead row.

export const METER_EVENT_NAME = 'qualified_lead'

// The slice of the Stripe SDK this module calls. The real client satisfies it, tests pass a fake.
export interface MeterApi {
  billing: {
    meters: {
      list(params: { status: 'active'; limit: number }): Promise<{ data: Array<{ id: string; event_name: string }> }>
      create(
        params: {
          display_name: string
          event_name: string
          default_aggregation: { formula: 'sum' }
          customer_mapping: { type: 'by_id'; event_payload_key: string }
          value_settings: { event_payload_key: string }
        },
        options: { idempotencyKey: string },
      ): Promise<{ id: string; event_name: string }>
    }
    meterEvents: {
      create(
        params: { event_name: string; identifier: string; payload: { stripe_customer_id: string; value: string } },
        options: { idempotencyKey: string },
      ): Promise<{ identifier: string }>
    }
  }
}

export interface LeadVerdict {
  qualified: boolean
  reason: string
}

const qualificationSchema = z.object({
  kind: z.literal('qualification'),
  leadId: z.string(),
  name: z.string(),
  company: z.string(),
  url: z.string(),
  qualified: z.boolean(),
  reason: z.string(),
  // Internal audit only (cost of sale per lead); never leaves the server.
  provider: z.string(),
  costMicro: z.number(),
})

const meterEventSchema = z.object({
  kind: z.literal('meter_event'),
  leadId: z.string(),
  identifier: z.string(),
  eventName: z.string(),
  meterId: z.string(),
  stripeCustomerId: z.string(),
  stripeInvoiceId: z.string().nullable(),
})

const meterRowSchema = z.discriminatedUnion('kind', [
  qualificationSchema,
  meterEventSchema,
  z.object({ kind: z.literal('meter_failed'), error: z.string() }),
])

type QualificationRow = z.infer<typeof qualificationSchema>
type MeterEventRow = z.infer<typeof meterEventSchema>

export interface ClientLeadRow {
  id: string
  name: string
  company: string
  qualified: boolean
  reason: string
  meterIdentifier: string | null
}

function normalizedUrl(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
}

// Code decides qualification: has name, company and url, and is not a duplicate in this order.
export function qualifyLeads(leads: SourcedLead[]): Array<SourcedLead & LeadVerdict> {
  const seen = new Map<string, string>()
  return leads.map((lead) => {
    const missing = (['name', 'company', 'url'] as const).find((field) => !lead[field].trim())
    if (missing) return { ...lead, qualified: false, reason: `missing ${missing}` }
    const keys = [
      `id:${lead.id}`,
      `url:${normalizedUrl(lead.url)}`,
      `person:${lead.name.trim().toLowerCase()}|${lead.company.trim().toLowerCase()}`,
    ]
    const firstId = keys.map((key) => seen.get(key)).find((id) => id !== undefined)
    if (firstId !== undefined) return { ...lead, qualified: false, reason: `duplicate of ${firstId}` }
    for (const key of keys) seen.set(key, lead.id)
    return { ...lead, qualified: true, reason: 'has name, company and url; not a duplicate' }
  })
}

function readMeterRows(messageId: string): Array<z.infer<typeof meterRowSchema>> {
  return listStepEvents(messageId, 'meter').flatMap((event) => {
    const parsed = meterRowSchema.safeParse(JSON.parse(event.data_json))
    return parsed.success ? [parsed.data] : []
  })
}

function qualificationRows(messageId: string): QualificationRow[] {
  return readMeterRows(messageId).filter((row): row is QualificationRow => row.kind === 'qualification')
}

function meterEventRows(messageId: string): Map<string, MeterEventRow> {
  const rows = readMeterRows(messageId).filter((row): row is MeterEventRow => row.kind === 'meter_event')
  return new Map(rows.map((row) => [row.leadId, row]))
}

// Runs at sourcing time, while the stable lead ids are still in hand. Replays are no-ops.
export function recordLeadQualification(messageId: string, leads: SourcedLead[]): void {
  for (const [index, lead] of qualifyLeads(leads).entries()) {
    const row: QualificationRow = {
      kind: 'qualification',
      leadId: lead.id,
      name: lead.name,
      company: lead.company,
      url: lead.url,
      qualified: lead.qualified,
      reason: lead.reason,
      provider: lead.provider,
      costMicro: lead.costMicro,
    }
    recordEventOnce({
      id: `meter:${messageId}:qualify:${index}:${lead.id}`,
      message_id: messageId,
      step: 'meter',
      summary: `${lead.qualified ? 'Qualified' : 'Rejected'} lead ${lead.id}: ${lead.reason}.`,
      data_json: JSON.stringify(row),
      policy_clause: 'P2',
    })
  }
}

export async function ensureQualifiedLeadMeter(stripe: MeterApi): Promise<string> {
  const meters = await stripe.billing.meters.list({ status: 'active', limit: 100 })
  const existing = meters.data.find((meter) => meter.event_name === METER_EVENT_NAME)
  if (existing) return existing.id
  const created = await stripe.billing.meters.create({
    display_name: 'Qualified leads',
    event_name: METER_EVENT_NAME,
    default_aggregation: { formula: 'sum' },
    customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
    value_settings: { event_payload_key: 'value' },
  }, { idempotencyKey: `meter-${METER_EVENT_NAME}` })
  return created.id
}

// Runs after the invoice exists. Sends one meter event per qualified lead not yet metered.
// Never throws: the one-off invoice is the money path and must not fail on metering.
export async function meterQualifiedLeads(messageId: string, api?: MeterApi): Promise<number> {
  try {
    const invoice = getInvoice(messageId)
    if (!invoice?.client_id) throw new Error('No Stripe customer on the invoice for this order.')
    const stripeCustomerId = invoice.client_id
    const sent = meterEventRows(messageId)
    const pending = qualificationRows(messageId).filter((row) => row.qualified && !sent.has(row.leadId))
    if (!pending.length) return 0
    const stripe = api ?? getStripe()
    const meterId = await ensureQualifiedLeadMeter(stripe)
    for (const row of pending) {
      const event = await stripe.billing.meterEvents.create({
        event_name: METER_EVENT_NAME,
        identifier: row.leadId,
        payload: { stripe_customer_id: stripeCustomerId, value: '1' },
      }, { idempotencyKey: `meter-event-${messageId}-${row.leadId}` })
      const meterRow: MeterEventRow = {
        kind: 'meter_event',
        leadId: row.leadId,
        identifier: event.identifier,
        eventName: METER_EVENT_NAME,
        meterId,
        stripeCustomerId,
        stripeInvoiceId: invoice.stripe_invoice_id,
      }
      recordEventOnce({
        id: `meter:${messageId}:sent:${row.leadId}`,
        message_id: messageId,
        step: 'meter',
        summary: `Sent meter event ${event.identifier} for qualified lead ${row.leadId}.`,
        data_json: JSON.stringify(meterRow),
        policy_clause: 'P2',
      })
    }
    return pending.length
  } catch (error) {
    recordEvent({
      id: crypto.randomUUID(),
      message_id: messageId,
      step: 'meter',
      summary: `Metering qualified leads failed: ${String(error)}`,
      data_json: JSON.stringify({ kind: 'meter_failed', error: String(error) }),
      policy_clause: null,
    })
    return 0
  }
}

// Client-safe per-lead rows for an invoice: no provider names, no sourcing cost.
export function invoiceLeadRows(invoiceId: string): ClientLeadRow[] | null {
  const invoice = getInvoice(invoiceId)
  if (!invoice) return null
  const sent = meterEventRows(invoice.message_id)
  return qualificationRows(invoice.message_id).map((row) => ({
    id: row.leadId,
    name: row.name,
    company: row.company,
    qualified: row.qualified,
    reason: row.reason,
    meterIdentifier: row.qualified ? sent.get(row.leadId)?.identifier ?? null : null,
  }))
}
