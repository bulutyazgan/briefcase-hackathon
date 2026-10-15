import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import { channelRoutes } from './features/channels/routes'
import { startSlack } from './features/channels/slack'
import { startTelegram } from './features/channels/telegram'
import { handleApproval, startAgentLoop } from './features/agent/agent'
import { BillingBlockedError, simulateInvoicePayment } from './features/billing/billing'
import {
  getApproval,
  getEvent,
  getInvoice,
  getMessage,
  getSetting,
  getState,
  listEventsByStep,
  listInvoices,
  setSetting,
} from './features/ledger/store'
import { leadsCsv } from './features/leads/leads'
import { controlStatus } from './features/control/control'
import { invoiceLeadRows } from './features/meters/meters'
import { buyerRoutes } from './features/buyer/routes'
import { startBuyerLoop } from './features/buyer/buyer'
import { stripePayments } from './features/buyer/providers/stripe-payments'
import { getStripe } from './features/billing/billing'
import { booksRoutes } from './features/books/routes'
import { listOpportunityViews } from './features/opportunities/opportunities'
import { companyStatus, learnCompany } from './features/company/company'
import { seedClientMemoryToCognee } from './features/memory/memory'
import { seedCompanyKnowledge } from './features/memory/company'
import { listClients } from './features/ledger/store'

const leadSchema = z.object({
  name: z.string(),
  company: z.string(),
  url: z.string(),
})
const leadsSchema = z.array(leadSchema)
const sourcedEventSchema = z.object({ leads: leadsSchema })

const invoicePdfDirectory = resolve(import.meta.dir, '../out')

async function resolveInvoicePdfPath(filePath: string): Promise<string | null> {
  try {
    const directory = await realpath(invoicePdfDirectory)
    const resolvedPath = await realpath(filePath)
    const pathFromDirectory = relative(directory, resolvedPath)
    if (
      pathFromDirectory === ''
      || pathFromDirectory === '..'
      || pathFromDirectory.startsWith(`..${sep}`)
      || isAbsolute(pathFromDirectory)
      || !(await stat(resolvedPath)).isFile()
    ) return null
    return resolvedPath
  } catch {
    return null
  }
}

const app = new Hono()

app.get('/health', (context) => context.json({ status: 'ok' }))
app.get('/api/state', (context) => context.json(getState()))
app.get('/api/company', async (context) => context.json(await companyStatus()))
app.post('/api/company/learn', async (context) => {
  const learned = await learnCompany()
  return context.json({ ...await companyStatus(), stored: learned.stored })
})
app.route('/api/channels', channelRoutes)
app.route('/api/buyer', buyerRoutes)
app.get('/api/control', (context) => context.json(controlStatus()))
app.route('/api/books', booksRoutes)
app.get('/api/opportunities', (context) => context.json({ opportunities: listOpportunityViews() }))
app.get('/api/clients', (context) => context.json({ clients: listClients() }))
app.get('/api/clients', (context) => context.json({ clients: listClients() }))

app.get('/api/leads', (context) => {
  const leads = listInvoices().flatMap((invoice) => {
    const event = getEvent(invoice.message_id, 'size')
    if (!event) return []
    let payload: unknown
    try {
      payload = JSON.parse(event.data_json)
    } catch {
      return []
    }
    const saved = sourcedEventSchema.safeParse(payload)
    if (!saved.success) return []
    const author = getMessage(invoice.message_id)?.author
    const clientName = author?.replace(/^Client — /, '') || invoice.client_id || 'Unknown client'
    return saved.data.leads.map((lead, index) => ({
      id: `${invoice.id}:${index}`,
      ...lead,
      invoiceId: invoice.id,
      clientName,
      invoiceStatus: invoice.status,
      totalPence: invoice.total_pence,
      sourcedAt: event.created_at,
    }))
  })
  return context.json(leads)
})

app.post('/api/approvals/:id', async (context) => {
  const messageId = context.req.param('id')
  const parsed = z.object({ action: z.enum(['approve', 'reject']) }).safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: 'Choose approve or reject.' }, 400)
  const approval = getApproval(messageId)
  if (!approval) return context.json({ error: 'Approval not found.' }, 404)
  if (approval.status !== 'pending') return context.json({ error: 'This approval is already closed.' }, 409)
  await handleApproval(messageId, parsed.data.action)
  return context.json({ status: parsed.data.action === 'approve' ? 'approved' : 'rejected' })
})

app.post('/api/invoices/:id/simulate-payment', async (context) => {
  const invoiceId = context.req.param('id')
  if (!getInvoice(invoiceId)) return context.json({ error: 'Invoice not found.' }, 404)
  try {
    await simulateInvoicePayment(invoiceId)
    return context.json({ status: 'payment_submitted' })
  } catch (error) {
    const status = error instanceof BillingBlockedError ? 503 : 400
    const message = error instanceof Error ? error.message : 'Test payment failed.'
    return context.json({ error: message }, status)
  }
})

app.get('/api/leads/:invoiceId.csv', (context) => {
  const invoice = getInvoice(context.req.param('invoiceId') ?? '')
  if (!invoice) return context.text('Invoice not found.', 404)
  const event = getEvent(invoice.message_id, 'size')
  if (!event) return context.text('Lead list not found.', 404)
  const parsed: unknown = JSON.parse(event.data_json)
  if (!parsed || typeof parsed !== 'object' || !('leads' in parsed)) {
    return context.text('Lead list not found.', 404)
  }
  const leads = leadsSchema.safeParse(parsed.leads)
  if (!leads.success) return context.text('Lead list is invalid.', 500)
  return context.body(leadsCsv(leads.data), 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="tally-${invoice.id}.csv"`,
  })
})

app.get('/api/invoices/:id/leads', (context) => {
  const rows = invoiceLeadRows(context.req.param('id'))
  if (!rows) return context.json({ error: 'Invoice not found.' }, 404)
  return context.json({ leads: rows })
})

app.get('/api/invoices/:id/pdf', async (context) => {
  const invoiceId = context.req.param('id')
  const invoice = getInvoice(invoiceId)
  const storedPdfPath = invoice?.pdf_path
  const pdfPath = storedPdfPath ? await resolveInvoicePdfPath(storedPdfPath) : null
  if (!pdfPath) return context.text('Invoice PDF not found.', 404)
  return context.body(Bun.file(pdfPath), 200, {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="tally-${invoiceId}.pdf"`,
  })
})

if (!listEventsByStep('company_learned').length) {
  void learnCompany().catch((error: unknown) => console.error(`Company knowledge learning failed: ${String(error)}`))
}

if (getSetting('cognee_seed:louis') !== 'true') {
  void seedClientMemoryToCognee('Louis')
    .then((stored) => {
      if (stored) setSetting('cognee_seed:louis', 'true')
    })
    .catch((error: unknown) => console.error(`Louis memory seeding failed: ${String(error)}`))
}

startAgentLoop()
// P12: the company knowledge base reaches Cognee once per seed version; the local seed answers meanwhile.
void seedCompanyKnowledge()
  .then((result) => { if (result.written) console.info(`Seeded ${result.written} company facts into Cognee dataset "company".`) })
  .catch((error: unknown) => console.warn(`Company knowledge seed failed: ${String(error)}`))
startBuyerLoop(() => stripePayments(getStripe()))
void startSlack().catch((error) => console.error(`Slack Socket Mode failed: ${String(error)}`))
void startTelegram(async (messageId, action) => {
  const approval = getApproval(messageId)
  if (!approval) return 'Approval not found.'
  if (approval.status !== 'pending') return 'This approval is already closed.'
  void handleApproval(messageId, action).catch((error) => console.error(`Telegram approval failed: ${String(error)}`))
  return action === 'approve' ? 'Approved. Creating the invoice.' : 'Rejected.'
}).catch((error) => console.error(`Telegram failed: ${String(error)}`))

const port = Number(process.env.PORT ?? 8787)
Bun.serve({ port, fetch: app.fetch })
console.info(`Tally API listening on http://localhost:${port}`)
