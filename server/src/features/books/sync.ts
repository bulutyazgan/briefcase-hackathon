import { z } from 'zod'
import {
  getEvent,
  listEventsByStep,
  listInvoices,
  listJournalLines,
  postJournalLines,
  type InvoiceRow,
  type JournalLineRow,
} from '../ledger/store'
import {
  costOfSaleJournal,
  creditNoteJournal,
  invoiceJournal,
  paymentJournal,
  summariseBooks,
  type BookedLine,
  type InvoiceBooks,
  type InvoiceFacts,
  type Journal,
} from './books'

const sourceEventSchema = z.object({ costMicro: z.number().nonnegative() })
// Credit notes come from the credit-note layer as ledger events; amounts are net pence.
const creditNoteEventSchema = z.object({
  amountPence: z.number().int().positive().optional(),
  netPence: z.number().int().positive().optional(),
  creditNoteId: z.string().optional(),
  invoiceId: z.string().optional(),
})

function day(timestamp: string): string {
  return timestamp.slice(0, 10)
}

function parseEventData<T>(schema: z.ZodType<T>, dataJson: string): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(dataJson))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function toRows(journal: Journal): JournalLineRow[] {
  return journal.lines.map((line, index) => ({
    journal_id: journal.id,
    line_no: index,
    invoice_id: journal.invoiceId,
    kind: journal.kind,
    reference: journal.reference,
    date: journal.date,
    description: journal.description,
    account: line.account,
    debit_pence: line.debitPence,
    credit_pence: line.creditPence,
    tax_rate: line.taxRate,
  }))
}

function invoiceFacts(invoice: InvoiceRow): InvoiceFacts {
  return {
    invoiceId: invoice.id,
    reference: invoice.stripe_invoice_id ?? invoice.id,
    date: day(invoice.created_at),
    netPence: invoice.total_pence,
  }
}

// Every journal the ledger's facts imply.
function impliedJournals(): Journal[] {
  const invoices = listInvoices().filter((invoice) => invoice.stripe_invoice_id)
  const journals: Journal[] = []
  for (const invoice of invoices) {
    const facts = invoiceFacts(invoice)
    journals.push(invoiceJournal(facts))
    const source = getEvent(invoice.message_id, 'source')
    const cost = source ? parseEventData(sourceEventSchema, source.data_json) : null
    if (cost && cost.costMicro > 0) journals.push(costOfSaleJournal(facts, cost.costMicro))
    if (invoice.status === 'paid') {
      const paid = getEvent(invoice.message_id, 'paid')
      journals.push(paymentJournal(facts, day(paid?.created_at ?? new Date().toISOString())))
    }
  }
  for (const event of listEventsByStep('credit_note')) {
    const note = parseEventData(creditNoteEventSchema, event.data_json)
    const netPence = note?.amountPence ?? note?.netPence
    const invoice = invoices.find((candidate) =>
      candidate.message_id === event.message_id || candidate.id === note?.invoiceId)
    if (!note || !netPence || !invoice) continue
    journals.push(creditNoteJournal(invoiceFacts(invoice), {
      creditNoteId: note.creditNoteId ?? event.id,
      date: day(event.created_at),
      netPence,
    }))
  }
  return journals
}

// Idempotent: posts any journal the ledger implies and has not yet recorded.
export function syncBooks(): void {
  postJournalLines(impliedJournals().flatMap(toRows))
}

export function bookedLines(): BookedLine[] {
  return listJournalLines().map((row) => ({
    invoiceId: row.invoice_id,
    date: row.date,
    reference: row.reference,
    account: row.account,
    description: row.description,
    debitPence: row.debit_pence,
    creditPence: row.credit_pence,
    taxRate: row.tax_rate,
  }))
}

export function invoiceBooks(): InvoiceBooks[] {
  return summariseBooks(bookedLines())
}
