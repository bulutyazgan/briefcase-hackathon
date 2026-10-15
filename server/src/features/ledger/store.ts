import { Database } from 'bun:sqlite'

export interface ChannelMessage {
  id: string
  channel: string
  thread: string
  author: string
  text: string
  ts: string
  processed_at: string | null
}

export interface EventRow {
  id: string
  message_id: string
  step: string
  summary: string
  data_json: string
  policy_clause: string | null
  created_at: string
}

export interface InvoiceRow {
  id: string
  message_id: string
  stripe_invoice_id: string | null
  client_id: string | null
  total_pence: number
  status: string
  hosted_url: string | null
  pdf_path: string | null
  created_at: string
}

export interface ApprovalRow {
  id: string
  message_id: string
  status: string
  reason: string
}

// One row per journal line; a journal is the set of rows sharing journal_id.
export interface JournalLineRow {
  journal_id: string
  line_no: number
  invoice_id: string
  kind: string
  reference: string
  date: string
  description: string
  account: string
  debit_pence: number
  credit_pence: number
  tax_rate: string
}

export interface AppState {
  messages: ChannelMessage[]
  invoices: InvoiceRow[]
  approvals: ApprovalRow[]
  events: EventRow[]
}

const database = new Database(process.env.TALLY_DB_PATH ?? 'tally.db')

database.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    thread TEXT NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    ts TEXT NOT NULL,
    processed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    step TEXT NOT NULL,
    summary TEXT NOT NULL,
    data_json TEXT NOT NULL,
    policy_clause TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE,
    stripe_invoice_id TEXT,
    client_id TEXT,
    total_pence INTEGER NOT NULL,
    status TEXT NOT NULL,
    hosted_url TEXT,
    pdf_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    reason TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS journal_lines (
    journal_id TEXT NOT NULL,
    line_no INTEGER NOT NULL,
    invoice_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    reference TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    account TEXT NOT NULL,
    debit_pence INTEGER NOT NULL,
    credit_pence INTEGER NOT NULL,
    tax_rate TEXT NOT NULL,
    PRIMARY KEY (journal_id, line_no)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

export function insertMessage(message: ChannelMessage): ChannelMessage {
  database.query(`
    INSERT OR IGNORE INTO messages (id, channel, thread, author, text, ts, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).run(message.id, message.channel, message.thread, message.author, message.text, message.ts)
  return getMessage(message.id) ?? message
}

export function getMessage(messageId: string): ChannelMessage | null {
  return database.query<ChannelMessage, [string]>('SELECT * FROM messages WHERE id = ?').get(messageId) ?? null
}

export function getOldestUnprocessedMessage(): ChannelMessage | null {
  return database.query<ChannelMessage, []>(`
    SELECT * FROM messages
    WHERE processed_at IS NULL AND author != 'tally'
    ORDER BY ts ASC LIMIT 1
  `).get() ?? null
}

export function markMessageProcessed(messageId: string): void {
  database.query('UPDATE messages SET processed_at = ? WHERE id = ?')
    .run(new Date().toISOString(), messageId)
}

export function recordEvent(event: Omit<EventRow, 'created_at'>): void {
  database.query(`
    INSERT INTO events (id, message_id, step, summary, data_json, policy_clause, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.message_id,
    event.step,
    event.summary,
    event.data_json,
    event.policy_clause,
    new Date().toISOString(),
  )
}

export function getEvent(messageId: string, step: string): EventRow | null {
  return database.query<EventRow, [string, string]>(`
    SELECT * FROM events WHERE message_id = ? AND step = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(messageId, step) ?? null
}

export function listEvents(messageId?: string): EventRow[] {
  if (messageId) {
    return database.query<EventRow, [string]>(`
      SELECT * FROM events WHERE message_id = ? ORDER BY created_at DESC LIMIT 250
    `).all(messageId)
  }
  return database.query<EventRow, []>('SELECT * FROM events ORDER BY created_at DESC LIMIT 250').all()
}

export function listEventsByStep(step: string): EventRow[] {
  return database.query<EventRow, [string]>('SELECT * FROM events WHERE step = ? ORDER BY created_at ASC').all(step)
}

export function listThreadMessages(thread: string): ChannelMessage[] {
  return database.query<ChannelMessage, [string]>('SELECT * FROM messages WHERE thread = ? ORDER BY ts ASC').all(thread)
}

export function saveInvoice(invoice: Omit<InvoiceRow, 'created_at'>): void {
  database.query(`
    INSERT OR IGNORE INTO invoices
      (id, message_id, stripe_invoice_id, client_id, total_pence, status, hosted_url, pdf_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invoice.id,
    invoice.message_id,
    invoice.stripe_invoice_id,
    invoice.client_id,
    invoice.total_pence,
    invoice.status,
    invoice.hosted_url,
    invoice.pdf_path,
  )
}

export function updateInvoice(invoiceId: string, status: string, hostedUrl?: string, pdfPath?: string): void {
  database.query(`
    UPDATE invoices SET status = ?, hosted_url = COALESCE(?, hosted_url),
      pdf_path = COALESCE(?, pdf_path) WHERE id = ?
  `).run(status, hostedUrl ?? null, pdfPath ?? null, invoiceId)
}

export function getInvoice(invoiceId: string): InvoiceRow | null {
  return database.query<InvoiceRow, [string]>('SELECT * FROM invoices WHERE id = ?').get(invoiceId) ?? null
}

export function listInvoices(): InvoiceRow[] {
  return database.query<InvoiceRow, []>('SELECT * FROM invoices ORDER BY created_at DESC').all()
}

export function listOpenInvoices(): InvoiceRow[] {
  return database.query<InvoiceRow, []>(`
    SELECT * FROM invoices WHERE status IN ('open', 'draft', 'pending')
  `).all()
}

// Journals are append-only: a journal posted twice keeps its first version.
export function postJournalLines(lines: JournalLineRow[]): void {
  const insert = database.query(`
    INSERT OR IGNORE INTO journal_lines
      (journal_id, line_no, invoice_id, kind, reference, date, description, account, debit_pence, credit_pence, tax_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  database.transaction(() => {
    for (const line of lines) {
      insert.run(
        line.journal_id,
        line.line_no,
        line.invoice_id,
        line.kind,
        line.reference,
        line.date,
        line.description,
        line.account,
        line.debit_pence,
        line.credit_pence,
        line.tax_rate,
      )
    }
  })()
}

export function listJournalLines(): JournalLineRow[] {
  return database.query<JournalLineRow, []>(`
    SELECT * FROM journal_lines ORDER BY date ASC, rowid ASC
  `).all()
}

export function saveApproval(approval: ApprovalRow): void {
  database.query(`
    INSERT INTO approvals (id, message_id, status, reason) VALUES (?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET status = excluded.status, reason = excluded.reason
  `).run(approval.id, approval.message_id, approval.status, approval.reason)
}

export function updateApproval(messageId: string, status: string): void {
  database.query('UPDATE approvals SET status = ? WHERE message_id = ?').run(status, messageId)
}

export function getApproval(messageId: string): ApprovalRow | null {
  return database.query<ApprovalRow, [string]>('SELECT * FROM approvals WHERE message_id = ?').get(messageId) ?? null
}

export function listApprovals(): ApprovalRow[] {
  return database.query<ApprovalRow, []>('SELECT * FROM approvals ORDER BY rowid DESC').all()
}

// The simulator composer has no thread picker: a new message from an author continues their latest thread,
// so "Why £1,080?" and a dispute resolve against the invoice they are about.
export function getLatestThreadForAuthor(channel: string, author: string): string | null {
  const row = database.query<{ thread: string }, [string, string]>(
    'SELECT thread FROM messages WHERE channel = ? AND author = ? ORDER BY ts DESC LIMIT 1',
  ).get(channel, author)
  return row?.thread ?? null
}

export function getLatestInvoiceForThread(thread: string): InvoiceRow | null {
  return database.query<InvoiceRow, [string]>(`
    SELECT invoices.* FROM invoices
    JOIN messages ON messages.id = invoices.message_id
    WHERE messages.thread = ? ORDER BY invoices.created_at DESC LIMIT 1
  `).get(thread) ?? null
}

export function getState(): AppState {
  return {
    messages: database.query<ChannelMessage, []>('SELECT * FROM messages ORDER BY ts DESC LIMIT 150').all(),
    invoices: listInvoices(),
    approvals: listApprovals(),
    events: listEvents(),
  }
}

export function resetLedger(): void {
  database.exec('DELETE FROM events; DELETE FROM invoices; DELETE FROM approvals; DELETE FROM messages; DELETE FROM journal_lines;')
}

export function getSetting(key: string): string | null {
  const row = database.query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?').get(key)
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  database.query(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

// Insert-once by deterministic id: returns false when the event was already recorded.
export function recordEventOnce(event: Omit<EventRow, 'created_at'>): boolean {
  const result = database.query(`
    INSERT OR IGNORE INTO events (id, message_id, step, summary, data_json, policy_clause, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.message_id,
    event.step,
    event.summary,
    event.data_json,
    event.policy_clause,
    new Date().toISOString(),
  )
  return result.changes > 0
}

export function listStepEvents(messageId: string, step: string): EventRow[] {
  return database.query<EventRow, [string, string]>(`
    SELECT * FROM events WHERE message_id = ? AND step = ? ORDER BY created_at ASC, rowid ASC
  `).all(messageId, step)
}
