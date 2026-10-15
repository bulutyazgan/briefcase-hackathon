// Exports a scrubbed, read-only snapshot of a recorded run for the public demo Worker.
// Usage (from server/): bun scripts/export-demo-snapshot.ts [source.db]
import { Database } from 'bun:sqlite'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const KEEP_THREADS = [
  { channel: 'simulator', thread: '3849cf2c-02bd-4b80-8e07-805504cb8498' },
  { channel: 'simulator', thread: '465a5129-e931-4f02-824d-979045418857' },
  { channel: 'telegram:8602525694', thread: '21' },
]
const CLIENT_EMAILS: Record<string, string> = { Louis: 'louis@example.com', 'Northwind Capital': 'billing+northwind@example.com' }

const source = resolve(process.argv[2] ?? 'tally.db')
const target = resolve('out/snapshot.db')
const outDir = resolve('../web/public/snapshot')
mkdirSync('out', { recursive: true })
rmSync(target, { force: true })
copyFileSync(source, target)

const fakeLeads = readFileSync('seed/leads.csv', 'utf8').trim().split('\n').slice(1).map((row) => {
  const [name, company, url] = row.split(',')
  return { name, company, url }
})

function scrub(value: string): string {
  return value
    .replace(/https:\/\/invoice\.stripe\.com\/[^\s"\\)]+/g, '(Stripe hosted invoice page, test mode)')
    .replace(/acct_[A-Za-z0-9]+/g, 'acct_demo')
    .replace(/cus_[A-Za-z0-9]+/g, 'cus_demo')
    .replace(/[\w.+-]+@(?!example\.com)[\w-]+\.[\w.]+/g, 'louis@example.com')
    .replace(/8602525694/g, 'demo')
    .replace(/\/Users\/[^\s"]*\/out\//g, '')
}

const db = new Database(target)
const keptMessages = db.query('select * from messages').all().filter((row: any) =>
  KEEP_THREADS.some((keep) => keep.channel === row.channel && keep.thread === row.thread)) as Array<Record<string, string | null>>
const keptIds = new Set(keptMessages.map((row) => row.id as string))
const lastLearned = db.query("select id from events where step = 'company_learned' order by created_at desc limit 1").get() as { id: string } | null

function scrubTree(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((item) => !(typeof item === 'string' && /verif/i.test(item)) && !(item && typeof item === 'object' && /verif/i.test(String((item as { fact?: unknown }).fact ?? '')))).map(scrubTree)
  if (!value || typeof value !== 'object') return value
  const entries = Object.entries(value).map(([key, child]) => {
    if (key === 'leads' && Array.isArray(child)) return [key, fakeLeads.slice(0, child.length)]
    return [key, scrubTree(child)]
  })
  const result = Object.fromEntries(entries) as Record<string, unknown>
  if (Array.isArray(result.leads) && typeof result.csv === 'string') {
    result.csv = ['name,company,url', ...(result.leads as Array<{ name: string; company: string; url: string }>).map((lead) => `"${lead.name}","${lead.company}","${lead.url}"`)].join('\n')
  }
  return result
}

function scrubData(_step: string, json: string): string {
  return scrub(JSON.stringify(scrubTree(JSON.parse(json))))
}

const events = (db.query('select * from events').all() as Array<Record<string, string | null>>).filter((row) =>
  keptIds.has(row.message_id as string) || (row.message_id as string).startsWith('opp-') || row.id === lastLearned?.id)
const invoices = (db.query('select * from invoices').all() as Array<Record<string, string | number | null>>).filter((row) => keptIds.has(row.message_id as string))
const approvals = (db.query('select * from approvals').all() as Array<Record<string, string | null>>).filter((row) => keptIds.has(row.message_id as string))

db.run('delete from messages'); db.run('delete from events'); db.run('delete from invoices'); db.run('delete from approvals'); db.run('delete from journal_lines'); db.run('delete from settings')
for (const row of keptMessages) db.query('insert into messages values (?, ?, ?, ?, ?, ?, ?)').run(scrub(row.id!), scrub(row.channel!), scrub(row.thread!), row.author!, scrub(row.text!.replace(/\nname,company,url[\s\S]*$/, "")), row.ts!, row.processed_at)
for (const row of events) db.query('insert into events values (?, ?, ?, ?, ?, ?, ?)').run(row.id!, scrub(row.message_id!), row.step!, scrub(row.summary!), scrubData(row.step!, row.data_json!), row.policy_clause, row.created_at!)
for (const row of invoices) db.query('insert into invoices values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(scrub(String(row.id)), scrub(String(row.message_id)), row.stripe_invoice_id, row.client_id ? 'cus_demo' : null, row.total_pence, row.status, null, row.pdf_path ? scrub(String(row.pdf_path)) : null, row.created_at)
for (const row of approvals) db.query('insert into approvals values (?, ?, ?, ?)').run(scrub(row.id!), scrub(row.message_id!), row.status!, row.reason!)
db.run("insert into settings values ('plan:Louis', 'yearly')")
db.close()

process.env.TALLY_DB_PATH = target
const store = await import('../src/features/ledger/store')
const { listOpportunityViews } = await import('../src/features/opportunities/opportunities')
const { controlStatus } = await import('../src/features/control/control')
const { companyStatus } = await import('../src/features/company/company')
const { invoiceLeadRows } = await import('../src/features/meters/meters')
const { booksRoutes } = await import('../src/features/books/routes')
const { leadsCsv } = await import('../src/features/leads/leads')
const { renderInvoicePdf } = await import('../src/features/invoice-pdf/render')

rmSync(outDir, { recursive: true, force: true })
for (const dir of ['', 'pdf', 'invoice-leads', 'leads-csv']) mkdirSync(join(outDir, dir), { recursive: true })
const write = (name: string, body: unknown) => writeFileSync(join(outDir, name), typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`)

for (const invoice of store.listInvoices()) {
  const sized = store.getEvent(invoice.message_id, 'size')
  const decided = store.getEvent(invoice.message_id, 'decide')
  const planChange = store.getEvent(invoice.message_id, 'plan_change')
  const clientName = planChange ? 'Louis' : 'Northwind Capital'
  const lines = planChange
    ? [{ description: 'Website care plan, yearly', quantity: 1, unitPricePence: invoice.total_pence, totalPence: invoice.total_pence, quote: JSON.parse(planChange.data_json).quote, memoryFact: 'Signed the website care plan at £500 per month, billed monthly', clauses: ['P2', 'P5', 'P8'] }]
    : JSON.parse(decided!.data_json).decision.lines
  const pdfPath = await renderInvoicePdf({
    invoiceId: invoice.id,
    issuedAt: new Date(`${invoice.created_at.replace(' ', 'T')}Z`),
    dueInDays: 7,
    client: { name: clientName, email: CLIENT_EMAILS[clientName] },
    totalPence: invoice.total_pence,
    lines,
    stripeInvoiceId: invoice.stripe_invoice_id ?? undefined,
  })
  copyFileSync(pdfPath, join(outDir, 'pdf', `${invoice.id}.pdf`))
  write(`invoice-leads/${invoice.id}.json`, { leads: invoiceLeadRows(invoice.id) ?? [] })
  if (sized) write(`leads-csv/${invoice.id}.csv`, leadsCsv(JSON.parse(sized.data_json).leads))
}

const leads = store.listInvoices().flatMap((invoice) => {
  const event = store.getEvent(invoice.message_id, 'size')
  if (!event) return []
  const author = store.getMessage(invoice.message_id)?.author
  const clientName = author?.replace(/^Client — /, '') || invoice.client_id || 'Unknown client'
  return (JSON.parse(event.data_json).leads as Array<{ name: string; company: string; url: string }>).map((lead, index) => ({
    id: `${invoice.id}:${index}`, ...lead, invoiceId: invoice.id, clientName, invoiceStatus: invoice.status, totalPence: invoice.total_pence, sourcedAt: event.created_at,
  }))
})

write('state.json', store.getState())
write('leads.json', leads)
write('opportunities.json', { opportunities: listOpportunityViews() })
write('control.json', { ...controlStatus(), paused: false, readOnly: true })
write('company.json', JSON.parse(scrub(JSON.stringify(await companyStatus()))))
write('books-journals.json', await (await booksRoutes.request('/journals')).json())
write('books-journals.csv', await (await booksRoutes.request('/journals.csv')).text())
console.info(`Snapshot written to ${outDir}`)
process.exit(0)
