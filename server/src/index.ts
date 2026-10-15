import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import { z } from 'zod'
import { channelRoutes } from './features/channels/routes'
import { startSlack } from './features/channels/slack'
import { handleApproval, startAgentLoop } from './features/agent/agent'
import { getApproval, getEvent, getInvoice, getState } from './features/ledger/store'
import { leadsCsv } from './features/leads/leads'
import { controlStatus } from './features/control/control'

const leadsSchema = z.array(z.object({
  name: z.string(),
  company: z.string(),
  url: z.string(),
}))

const app = new Hono()

app.get('/health', (context) => context.json({ status: 'ok' }))
app.get('/api/state', (context) => context.json(getState()))
app.route('/api/channels', channelRoutes)
app.get('/api/control', (context) => context.json(controlStatus()))

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

app.get('/api/invoices/:id/pdf', async (context) => {
  const invoice = getInvoice(context.req.param('id'))
  if (!invoice?.pdf_path || !(await Bun.file(invoice.pdf_path).exists())) {
    return context.text('Invoice PDF not found.', 404)
  }
  return context.body(await readFile(invoice.pdf_path), 200, {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="tally-${invoice.id}.pdf"`,
  })
})

startAgentLoop()
void startSlack().catch((error) => console.error(`Slack Socket Mode failed: ${String(error)}`))

const port = Number(process.env.PORT ?? 8787)
Bun.serve({ port, fetch: app.fetch })
console.info(`Tally API listening on http://localhost:${port}`)
