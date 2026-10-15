// In-memory replica of the Stripe API subset Tally uses. Bodies are form-encoded
// (as the Stripe Node SDK sends them); responses are Stripe-shaped JSON.

type Fields = Record<string, string>

interface Customer { id: string; object: 'customer'; name: string; email: string; created: number }
interface InvoiceItem {
  id: string
  object: 'invoiceitem'
  customer: string
  amount: number
  currency: string
  description: string
  invoice: string | null
  tax_rates: string[]
}
interface Invoice {
  id: string
  object: 'invoice'
  customer: string
  status: 'draft' | 'open' | 'paid' | 'void'
  currency: string
  collection_method: string
  days_until_due: number | null
  metadata: Record<string, string>
  description: string | null
  lines: { object: 'list'; data: InvoiceItem[] }
  subtotal: number
  tax: number
  total_taxes: { amount: number; tax_rate: string; tax_behavior: 'exclusive' }[]
  total: number
  amount_due: number
  amount_paid: number
  hosted_invoice_url: string | null
  created: number
}
type StoredObject = Customer | InvoiceItem | Invoice | Record<string, unknown>

const state = {
  customers: new Map<string, Customer>(),
  items: new Map<string, InvoiceItem>(),
  invoices: new Map<string, Invoice>(),
  other: new Map<string, Record<string, unknown>>(),
  idempotency: new Map<string, StoredObject>(),
  counter: 0,
}

export function resetStripe(): void {
  state.customers.clear()
  state.items.clear()
  state.invoices.clear()
  state.other.clear()
  state.idempotency.clear()
  state.counter = 0
}

export function stripeInvoices(): Invoice[] {
  return [...state.invoices.values()]
}

export function stripeObjects(): StoredObject[] {
  return [...state.customers.values(), ...state.items.values(), ...state.other.values()]
}

function newId(prefix: string): string {
  state.counter += 1
  return `${prefix}_mock_${state.counter.toString().padStart(4, '0')}`
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'request-id': `req_mock_${Date.now()}` } })
}

function stripeError(status: number, type: string, message: string, code?: string): Response {
  return json({ error: { type, message, ...(code ? { code } : {}) } }, status)
}

function metadataFrom(fields: Fields): Record<string, string> {
  const metadata: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    const match = key.match(/^metadata\[(.+)\]$/)
    if (match?.[1]) metadata[match[1]] = value
  }
  return metadata
}

function list<T>(data: T[], url: string): Record<string, unknown> {
  return { object: 'list', data, has_more: false, url }
}

function findInvoice(id: string): Invoice | null {
  return state.invoices.get(id) ?? null
}

function percentageOf(taxRateId: string): number {
  const rate = state.other.get(taxRateId)
  return rate && typeof rate.percentage === 'number' ? rate.percentage : 0
}

function recompute(invoice: Invoice): void {
  invoice.subtotal = invoice.lines.data.reduce((sum, item) => sum + item.amount, 0)
  const taxes = new Map<string, number>()
  for (const item of invoice.lines.data) {
    for (const rate of item.tax_rates) {
      taxes.set(rate, (taxes.get(rate) ?? 0) + Math.round(item.amount * percentageOf(rate) / 100))
    }
  }
  invoice.total_taxes = [...taxes].map(([rate, amount]) => ({ amount, tax_rate: rate, tax_behavior: 'exclusive' }))
  invoice.tax = invoice.total_taxes.reduce((sum, entry) => sum + entry.amount, 0)
  invoice.total = invoice.subtotal + invoice.tax
  invoice.amount_due = invoice.status === 'paid' ? 0 : invoice.total
}

function arrayField(fields: Fields, name: string): string[] {
  return Object.entries(fields)
    .filter(([key]) => key === name || new RegExp(`^${name}\\[\\d*\\]$`).test(key))
    .map(([, value]) => value)
}

function listOther(prefix: string, fields: Fields): Record<string, unknown>[] {
  return [...state.other.values()].filter((object) => {
    if (!String(object.id).startsWith(`${prefix}_`)) return false
    if (fields.active !== undefined && String(object.active) !== fields.active) return false
    if (fields.inclusive !== undefined && String(object.inclusive) !== fields.inclusive) return false
    if (fields.status !== undefined && object.status !== fields.status) return false
    return true
  })
}

export function payInvoice(id: string): Invoice | null {
  const invoice = findInvoice(id)
  if (!invoice) return null
  invoice.status = 'paid'
  invoice.amount_paid = invoice.total
  invoice.amount_due = 0
  return invoice
}

const restrictedPaths = [/^\/v1\/refunds/, /^\/v1\/charges/, /^\/v1\/payouts/, /^\/v1\/payment_intents/]

export async function handleStripe(request: Request, url: URL, mockBase: string): Promise<Response> {
  const auth = request.headers.get('authorization') ?? ''
  const key = auth.replace(/^Bearer\s+/i, '')
  if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
    return stripeError(401, 'invalid_request_error', 'Invalid API Key provided.')
  }
  const path = url.pathname
  if (key.startsWith('rk_test_') && restrictedPaths.some((pattern) => pattern.test(path))) {
    return stripeError(
      403,
      'invalid_request_error',
      `The provided key '${key.slice(0, 12)}…' does not have the required permissions for this endpoint. Having the 'rak_${path.split('/')[2]}_write' permission would allow this request to continue.`,
      'secret_key_required',
    )
  }

  const fields: Fields = {}
  if (request.method === 'GET') {
    for (const [name, value] of url.searchParams) fields[name] = value
  } else {
    const text = await request.text()
    for (const [name, value] of new URLSearchParams(text)) fields[name] = value
  }

  const idempotencyKey = request.headers.get('idempotency-key')
  const scopedKey = idempotencyKey ? `${request.method} ${path} ${idempotencyKey}` : null
  if (scopedKey) {
    const cached = state.idempotency.get(scopedKey)
    if (cached) return json(cached)
  }
  const remember = (object: StoredObject): Response => {
    if (scopedKey) state.idempotency.set(scopedKey, object)
    return json(object)
  }

  const post = request.method === 'POST'
  let match: RegExpMatchArray | null

  if (path === '/v1/customers' && !post) {
    const email = fields.email
    const data = [...state.customers.values()].filter((customer) => !email || customer.email === email)
    return json(list(data.slice(0, Number(fields.limit ?? 10)), '/v1/customers'))
  }
  if (path === '/v1/customers' && post) {
    const customer: Customer = {
      id: newId('cus'),
      object: 'customer',
      name: fields.name ?? '',
      email: fields.email ?? '',
      created: now(),
    }
    state.customers.set(customer.id, customer)
    return remember(customer)
  }
  if (path === '/v1/invoiceitems' && post) {
    const customer = fields.customer ?? ''
    if (!state.customers.has(customer)) return stripeError(400, 'invalid_request_error', `No such customer: '${customer}'`, 'resource_missing')
    const item: InvoiceItem = {
      id: newId('ii'),
      object: 'invoiceitem',
      customer,
      amount: Number(fields.amount ?? 0),
      currency: fields.currency ?? 'gbp',
      description: fields.description ?? '',
      invoice: fields.invoice ?? null,
      tax_rates: arrayField(fields, 'tax_rates'),
    }
    state.items.set(item.id, item)
    if (item.invoice) {
      const invoice = findInvoice(item.invoice)
      if (invoice) {
        invoice.lines.data.push(item)
        recompute(invoice)
      }
    }
    return remember(item)
  }
  if (path === '/v1/invoices' && post) {
    const customer = fields.customer ?? ''
    if (!state.customers.has(customer)) return stripeError(400, 'invalid_request_error', `No such customer: '${customer}'`, 'resource_missing')
    const invoice: Invoice = {
      id: newId('in'),
      object: 'invoice',
      customer,
      status: 'draft',
      currency: fields.currency ?? 'gbp',
      collection_method: fields.collection_method ?? 'charge_automatically',
      days_until_due: fields.days_until_due ? Number(fields.days_until_due) : null,
      metadata: metadataFrom(fields),
      description: fields.description ?? null,
      lines: { object: 'list', data: [] },
      subtotal: 0,
      tax: 0,
      total_taxes: [],
      total: 0,
      amount_due: 0,
      amount_paid: 0,
      hosted_invoice_url: null,
      created: now(),
    }
    // Real Stripe (API 2022-08-01+) defaults pending_invoice_items_behavior to
    // "exclude": pending items are NOT pulled in unless the caller opts in.
    if (fields.pending_invoice_items_behavior === 'include') {
      for (const item of state.items.values()) {
        if (item.customer === customer && item.invoice === null) {
          item.invoice = invoice.id
          invoice.lines.data.push(item)
        }
      }
    }
    recompute(invoice)
    state.invoices.set(invoice.id, invoice)
    return remember(invoice)
  }
  if (path === '/v1/invoices' && !post) {
    const data = [...state.invoices.values()].filter((invoice) => !fields.customer || invoice.customer === fields.customer)
    return json(list(data, '/v1/invoices'))
  }
  if ((match = path.match(/^\/v1\/invoices\/([^/]+)\/finalize$/)) && post) {
    const invoice = findInvoice(match[1] ?? '')
    if (!invoice) return stripeError(404, 'invalid_request_error', 'No such invoice', 'resource_missing')
    if (invoice.status === 'draft') {
      invoice.status = 'open'
      invoice.hosted_invoice_url = `${mockBase}/hosted/${invoice.id}`
      recompute(invoice)
    }
    return remember(invoice)
  }
  // Stripe emails the hosted invoice; the mock just acknowledges it.
  if ((match = path.match(/^\/v1\/invoices\/([^/]+)\/send$/)) && post) {
    const invoice = findInvoice(match[1] ?? '')
    if (!invoice) return stripeError(404, 'invalid_request_error', 'No such invoice', 'resource_missing')
    return remember(invoice)
  }
  if ((match = path.match(/^\/v1\/invoices\/([^/]+)\/pay$/)) && post) {
    const invoice = payInvoice(match[1] ?? '')
    if (!invoice) return stripeError(404, 'invalid_request_error', 'No such invoice', 'resource_missing')
    return remember(invoice)
  }
  if ((match = path.match(/^\/v1\/invoices\/([^/]+)$/)) && !post) {
    const invoice = findInvoice(match[1] ?? '')
    if (!invoice) return stripeError(404, 'invalid_request_error', 'No such invoice', 'resource_missing')
    return json(invoice)
  }
  if ((match = path.match(/^\/v1\/payment_methods\/([^/]+)\/attach$/)) && post) {
    const paymentMethod = {
      id: match[1] === 'pm_card_visa' ? newId('pm') : match[1],
      object: 'payment_method',
      type: 'card',
      customer: fields.customer ?? null,
      card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2034 },
      created: now(),
    }
    state.other.set(String(paymentMethod.id), paymentMethod)
    return remember(paymentMethod)
  }
  if (path === '/v1/tax_rates' && !post) return json(list(listOther('txr', fields), '/v1/tax_rates'))
  if (path === '/v1/billing/meters' && !post) return json(list(listOther('mtr', fields), '/v1/billing/meters'))
  if (path === '/v1/tax_rates' && post) {
    const taxRate = {
      id: newId('txr'),
      object: 'tax_rate',
      display_name: fields.display_name ?? '',
      percentage: Number(fields.percentage ?? 0),
      inclusive: fields.inclusive === 'true',
      active: fields.active !== 'false',
      country: fields.country ?? null,
      jurisdiction: fields.jurisdiction ?? null,
      tax_type: fields.tax_type ?? null,
      metadata: metadataFrom(fields),
      created: now(),
    }
    state.other.set(taxRate.id, taxRate)
    return remember(taxRate)
  }
  if (path === '/v1/billing/meters' && post) {
    const meter = {
      id: newId('mtr'),
      object: 'billing.meter',
      display_name: fields.display_name ?? '',
      event_name: fields.event_name ?? '',
      status: 'active',
      default_aggregation: { formula: fields['default_aggregation[formula]'] ?? 'sum' },
      created: now(),
    }
    state.other.set(meter.id, meter)
    return remember(meter)
  }
  if (path === '/v1/billing/meter_events' && post) {
    const event = {
      object: 'billing.meter_event',
      event_name: fields.event_name ?? '',
      identifier: fields.identifier ?? newId('mev'),
      payload: Object.fromEntries(Object.entries(fields).flatMap(([key, value]) => {
        const field = key.match(/^payload\[(.+)\]$/)?.[1]
        return field ? [[field, value]] : []
      })),
      created: now(),
      livemode: false,
    }
    state.other.set(`mev_${event.identifier}`, event)
    return remember(event)
  }
  if (path === '/v1/credit_notes' && post) {
    const invoice = findInvoice(fields.invoice ?? '')
    if (!invoice) return stripeError(400, 'invalid_request_error', 'No such invoice', 'resource_missing')
    const quantity = Number(fields['lines[0][quantity]'] ?? 1)
    const unitAmount = Number(fields['lines[0][unit_amount]'] ?? 0)
    const amount = fields.amount ? Number(fields.amount) : quantity * unitAmount
    const creditNote = {
      id: newId('cn'),
      object: 'credit_note',
      invoice: invoice.id,
      customer: invoice.customer,
      amount,
      subtotal: amount,
      total: amount,
      currency: invoice.currency,
      reason: fields.reason ?? null,
      memo: fields.memo ?? null,
      status: 'issued',
      lines: {
        object: 'list',
        data: [{ type: fields['lines[0][type]'] ?? 'custom_line_item', description: fields['lines[0][description]'] ?? '', quantity, unit_amount: unitAmount, amount }],
      },
      metadata: metadataFrom(fields),
      created: now(),
    }
    state.other.set(creditNote.id, creditNote)
    return remember(creditNote)
  }
  return stripeError(404, 'invalid_request_error', `Unrecognized request URL (${request.method}: ${path}).`)
}

export function hostedInvoicePage(id: string): Response {
  const invoice = findInvoice(id)
  if (!invoice) return new Response('Invoice not found', { status: 404 })
  const amount = new Intl.NumberFormat('en-GB', { style: 'currency', currency: invoice.currency.toUpperCase() }).format(invoice.total / 100)
  const paid = invoice.status === 'paid'
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${invoice.id}</title>
<style>body{font-family:system-ui;max-width:420px;margin:48px auto;padding:16px}button{font-size:16px;padding:10px 18px}</style></head>
<body><p>Mock Stripe hosted invoice</p><h1 data-testid="amount">${amount}</h1>
<p>Invoice <code>${invoice.id}</code> · status <strong data-testid="status">${invoice.status}</strong></p>
${paid ? '<p data-testid="paid">Paid. Thank you.</p>' : `<form method="post" action="/hosted/${invoice.id}/pay"><input readonly value="4242 4242 4242 4242"><button type="submit">Pay with 4242</button></form>`}
</body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
