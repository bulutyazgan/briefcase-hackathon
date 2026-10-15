export interface InvoiceBooks {
  invoiceId: string
  reference: string
  netPence: number
  vatPence: number
  grossPence: number
  costPence: number
  marginPence: number
  marginRatio: number | null
  paid: boolean
}

const numberFields = ['netPence', 'vatPence', 'grossPence', 'costPence', 'marginPence'] as const

function isInvoiceBooks(value: unknown): value is InvoiceBooks {
  return typeof value === 'object' && value !== null
    && 'invoiceId' in value && typeof value.invoiceId === 'string'
    && 'reference' in value && typeof value.reference === 'string'
    && 'paid' in value && typeof value.paid === 'boolean'
    && 'marginRatio' in value && (value.marginRatio === null || typeof value.marginRatio === 'number')
    && numberFields.every((field) => field in value && typeof Reflect.get(value, field) === 'number')
}

export async function fetchBooks(): Promise<InvoiceBooks[]> {
  const response = await fetch('/api/books/journals')
  if (!response.ok) throw new Error(`Books request failed (${response.status}).`)
  const payload: unknown = await response.json()
  if (
    typeof payload !== 'object' || payload === null || !('invoices' in payload)
    || !Array.isArray(payload.invoices) || !payload.invoices.every(isInvoiceBooks)
  ) {
    throw new Error('The server returned an invalid books response.')
  }
  return payload.invoices
}

export const journalsCsvUrl = '/api/books/journals.csv'
