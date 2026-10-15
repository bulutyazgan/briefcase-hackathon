import { microUsdToPence } from '../pricing/pricing'

// UK standard-rate VAT, charged on top of the net price (exclusive).
export const VAT_PERCENT = 20

export const ACCOUNTS = {
  debtors: 'Debtors',
  sales: 'Sales',
  vatOutput: 'VAT output',
  costOfSales: 'Cost of sales',
  supplierCreditors: 'Creditors: Lead data supplier',
  bank: 'Bank',
} as const
export type Account = typeof ACCOUNTS[keyof typeof ACCOUNTS]

// Xero tax-rate labels, so the CSV imports without remapping.
export const TAX_RATES = { vatOnIncome: '20% (VAT on Income)', none: 'No VAT' } as const
export type TaxRate = typeof TAX_RATES[keyof typeof TAX_RATES]

export type JournalKind = 'invoice' | 'cost_of_sale' | 'payment' | 'credit_note'

export interface JournalLine {
  account: Account
  debitPence: number
  creditPence: number
  taxRate: TaxRate
}

export interface Journal {
  id: string
  invoiceId: string
  kind: JournalKind
  reference: string
  date: string
  description: string
  lines: JournalLine[]
}

export interface VatBreakdown {
  netPence: number
  vatPence: number
  grossPence: number
}

export function vatBreakdown(netPence: number): VatBreakdown {
  const vatPence = Math.round(netPence * VAT_PERCENT / 100)
  return { netPence, vatPence, grossPence: netPence + vatPence }
}

function pounds(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function vatBreakdownText(netPence: number): string {
  const { vatPence, grossPence } = vatBreakdown(netPence)
  return `${pounds(netPence)} net + ${pounds(vatPence)} VAT (${VAT_PERCENT}%) = ${pounds(grossPence)}`
}

function debit(account: Account, pence: number, taxRate: TaxRate = TAX_RATES.none): JournalLine {
  return { account, debitPence: pence, creditPence: 0, taxRate }
}

function credit(account: Account, pence: number, taxRate: TaxRate = TAX_RATES.none): JournalLine {
  return { account, debitPence: 0, creditPence: pence, taxRate }
}

export interface InvoiceFacts {
  invoiceId: string
  reference: string
  date: string
  netPence: number
}

// Invoice finalised: Dr Debtors (gross) / Cr Sales (net) / Cr VAT output (vat).
export function invoiceJournal(invoice: InvoiceFacts): Journal {
  const { netPence, vatPence, grossPence } = vatBreakdown(invoice.netPence)
  return {
    id: `invoice-${invoice.invoiceId}`,
    invoiceId: invoice.invoiceId,
    kind: 'invoice',
    reference: invoice.reference,
    date: invoice.date,
    description: 'Lead list invoice',
    lines: [
      debit(ACCOUNTS.debtors, grossPence),
      credit(ACCOUNTS.sales, netPence, TAX_RATES.vatOnIncome),
      credit(ACCOUNTS.vatOutput, vatPence),
    ],
  }
}

// Sourcing cost for the invoice: Dr Cost of sales / Cr Creditors (lead data supplier).
export function costOfSaleJournal(invoice: InvoiceFacts, costMicroUsd: number): Journal {
  const costPence = Math.round(microUsdToPence(costMicroUsd))
  return {
    id: `cost_of_sale-${invoice.invoiceId}`,
    invoiceId: invoice.invoiceId,
    kind: 'cost_of_sale',
    reference: invoice.reference,
    date: invoice.date,
    description: 'Lead data purchased for this invoice',
    lines: [debit(ACCOUNTS.costOfSales, costPence), credit(ACCOUNTS.supplierCreditors, costPence)],
  }
}

// Paid: Dr Bank / Cr Debtors for the invoice gross.
export function paymentJournal(invoice: InvoiceFacts, paidDate: string): Journal {
  const { grossPence } = vatBreakdown(invoice.netPence)
  return {
    id: `payment-${invoice.invoiceId}`,
    invoiceId: invoice.invoiceId,
    kind: 'payment',
    reference: invoice.reference,
    date: paidDate,
    description: 'Payment received',
    lines: [debit(ACCOUNTS.bank, grossPence), credit(ACCOUNTS.debtors, grossPence)],
  }
}

export interface CreditNoteFacts {
  creditNoteId: string
  date: string
  netPence: number
}

// Credit note: reverses sales and VAT output; Debtors falls by the gross credited.
export function creditNoteJournal(invoice: InvoiceFacts, note: CreditNoteFacts): Journal {
  const { netPence, vatPence, grossPence } = vatBreakdown(note.netPence)
  return {
    id: `credit_note-${note.creditNoteId}`,
    invoiceId: invoice.invoiceId,
    kind: 'credit_note',
    reference: invoice.reference,
    date: note.date,
    description: 'Credit note',
    lines: [
      debit(ACCOUNTS.sales, netPence, TAX_RATES.vatOnIncome),
      debit(ACCOUNTS.vatOutput, vatPence),
      credit(ACCOUNTS.debtors, grossPence),
    ],
  }
}

export function isBalanced(journal: Journal): boolean {
  const debits = journal.lines.reduce((sum, line) => sum + line.debitPence, 0)
  const credits = journal.lines.reduce((sum, line) => sum + line.creditPence, 0)
  return debits === credits && debits > 0
}

export const CSV_COLUMNS = ['Date', 'Reference', 'Account', 'Description', 'Debit', 'Credit', 'TaxRate'] as const

export interface CsvLine {
  date: string
  reference: string
  account: string
  description: string
  debitPence: number
  creditPence: number
  taxRate: string
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function csvAmount(pence: number): string {
  return pence ? (pence / 100).toFixed(2) : ''
}

export function journalsCsv(lines: CsvLine[]): string {
  const rows = lines.map((line) => [
    line.date,
    line.reference,
    line.account,
    line.description,
    csvAmount(line.debitPence),
    csvAmount(line.creditPence),
    line.taxRate,
  ].map(csvField).join(','))
  return [CSV_COLUMNS.join(','), ...rows].join('\n')
}

export interface InvoiceBooks {
  invoiceId: string
  reference: string
  netPence: number
  vatPence: number
  grossPence: number
  costPence: number
  marginPence: number
  // Margin over net sales after credit notes; null when nothing is left to sell against.
  marginRatio: number | null
  paid: boolean
}

export interface BookedLine extends CsvLine {
  invoiceId: string
}

// Per-invoice view of the posted journals: what was sold, what it cost, what is left.
export function summariseBooks(lines: BookedLine[]): InvoiceBooks[] {
  const byInvoice = new Map<string, InvoiceBooks>()
  for (const line of lines) {
    const books = byInvoice.get(line.invoiceId) ?? {
      invoiceId: line.invoiceId,
      reference: line.reference,
      netPence: 0,
      vatPence: 0,
      grossPence: 0,
      costPence: 0,
      marginPence: 0,
      marginRatio: null,
      paid: false,
    }
    const net = line.creditPence - line.debitPence
    if (line.account === ACCOUNTS.sales) books.netPence += net
    if (line.account === ACCOUNTS.vatOutput) books.vatPence += net
    if (line.account === ACCOUNTS.costOfSales) books.costPence += line.debitPence - line.creditPence
    if (line.account === ACCOUNTS.bank && line.debitPence > 0) books.paid = true
    byInvoice.set(line.invoiceId, books)
  }
  return [...byInvoice.values()].map((books) => {
    const marginPence = books.netPence - books.costPence
    return {
      ...books,
      grossPence: books.netPence + books.vatPence,
      marginPence,
      marginRatio: books.netPence > 0 ? marginPence / books.netPence : null,
    }
  })
}
