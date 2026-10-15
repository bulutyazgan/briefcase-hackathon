import { useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import type { AppState, EventRow, InvoiceRow } from '../../api'
import { Button } from '../../components/ui/button'
import { Page, Opening, Section } from '../../components/ui/page'
import { RowList, RowListItem } from '../../components/ui/row-list'
import { StatStrip } from '../../components/ui/stat-strip'
import { Text } from '../../components/ui/text'
import { Table } from '../../components/ui/table'
import { content } from '../../components/ui/content.stylex'
import { Link } from '../../router'
import { evidenceFromEvent, simulateInvoicePayment } from './api'

function money(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

function clientName(state: AppState, invoice: InvoiceRow): string {
  const author = state.messages.find((message) => message.id === invoice.message_id)?.author
  return author?.replace(/^Client — /, '') || invoice.client_id || 'Client not recorded'
}

function decisionEvent(state: AppState, invoice: InvoiceRow): EventRow | undefined {
  return state.events.find((event) => event.message_id === invoice.message_id && (event.step === 'decide' || event.data_json.includes('"decision"')))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function arithmetic(event: EventRow | undefined, totalPence: number): string {
  if (!event) return `Invoice total: ${money(totalPence)}`
  try {
    const parsed: unknown = JSON.parse(event.data_json)
    if (!isRecord(parsed) || !isRecord(parsed.decision) || !Array.isArray(parsed.decision.lines)) return `Invoice total: ${money(totalPence)}`
    const line = parsed.decision.lines.find((value) => isRecord(value) && typeof value.quantity === 'number' && typeof value.unitPricePence === 'number')
    if (!isRecord(line) || typeof line.quantity !== 'number' || typeof line.unitPricePence !== 'number') return `Invoice total: ${money(totalPence)}`
    const subtotal = line.quantity * line.unitPricePence
    const discount = subtotal - totalPence
    return `${line.quantity} × ${money(line.unitPricePence)} = ${money(subtotal)}${discount > 0 ? ` − ${money(discount)} agreed discount` : ''} = ${money(totalPence)}`
  } catch {
    return `Invoice total: ${money(totalPence)}`
  }
}

export function Invoices({ state }: { state: AppState }) {
  const open = state.invoices.filter((invoice) => invoice.status !== 'paid')
  const total = state.invoices.reduce((sum, invoice) => sum + invoice.total_pence, 0)
  const openTotal = open.reduce((sum, invoice) => sum + invoice.total_pence, 0)
  const columns = [
    { key: 'client', label: 'Client', render: (invoice: InvoiceRow) => <Link to={`/app/invoices/${encodeURIComponent(invoice.id)}`} {...stylex.props(content.link)}>{clientName(state, invoice)}</Link> },
    { key: 'amount', label: 'Amount', mono: true, render: (invoice: InvoiceRow) => <Text role="mono">{money(invoice.total_pence)}</Text> },
    { key: 'status', label: 'Status', render: (invoice: InvoiceRow) => <span {...stylex.props(content.status)}>{invoice.status === 'paid' ? 'Paid' : 'Open'}</span> },
    { key: 'created', label: 'Created', mono: true, render: (invoice: InvoiceRow) => <Text role="mono">{new Date(invoice.created_at).toLocaleDateString('en-GB')}</Text> },
  ]
  return (
    <Page>
      <Opening title={openTotal ? `${money(openTotal)} still to collect` : 'All invoices are up to date'} lede="A clear view of every commitment turned into a Stripe invoice." tools={<Button variant="primary" onClick={() => window.location.assign('/app/inbox')}>Open inbox</Button>} />
      <StatStrip items={[
        { label: 'Invoices', value: state.invoices.length, mono: true },
        { label: 'Outstanding', value: money(openTotal), mono: true },
        { label: 'Total billed', value: money(total), mono: true },
      ]} />
      <Section title="Invoices" description="Select an invoice to review its evidence and PDF">
        {state.invoices.length ? <Table rows={state.invoices} columns={columns} rowKey={(invoice) => invoice.id} /> : <div {...stylex.props(content.well)}><Text role="compact">No invoices have been created yet.</Text></div>}
      </Section>
    </Page>
  )
}

export function InvoiceDetail({ state, invoiceId, onRefresh }: { state: AppState; invoiceId: string; onRefresh: () => void }) {
  const invoice = state.invoices.find((item) => item.id === invoiceId)
  const [paying, setPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  if (!invoice) {
    return <Page><Opening title="This invoice is not in the ledger" lede="Check the invoice URL or return to the invoice list." tools={<Link to="/app/invoices" {...stylex.props(content.link)}>View invoices</Link>} /></Page>
  }
  const event = decisionEvent(state, invoice)
  const evidence = evidenceFromEvent(event)
  const client = clientName(state, invoice)
  const paid = invoice.status === 'paid'
  const invoicePath = `/api/invoices/${encodeURIComponent(invoice.id)}/pdf`

  async function pay(): Promise<void> {
    if (paying || paid) return
    setPaying(true)
    setPaymentError('')
    try {
      await simulateInvoicePayment(invoiceId)
      onRefresh()
    } catch (error) {
      setPaymentError(String(error))
    } finally {
      setPaying(false)
    }
  }

  return (
    <Page>
      <Opening
        title={paid ? `${money(invoice.total_pence)} collected from ${client}` : `${money(invoice.total_pence)} awaiting payment`}
        lede="The invoice, client agreement and policy decision are linked in one record."
        tools={<>
          {invoice.hosted_url ? <a href={invoice.hosted_url} target="_blank" rel="noreferrer" {...stylex.props(content.link)}>View Stripe invoice</a> : null}
          <Button variant="primary" disabled={paid || paying || !invoice.stripe_invoice_id} onClick={() => void pay()}>{paid ? 'Pay as client (test card)' : paying ? 'Processing payment' : 'Pay as client (test card)'}</Button>
        </>}
      />
      {paid ? <Text role="compact">This invoice is already paid.</Text> : null}
      {paymentError ? <p role="alert" {...stylex.props(content.error)}>{paymentError}</p> : null}
      <div id="invoice-amount"><StatStrip items={[
        { label: 'Amount', value: money(invoice.total_pence), mono: true },
        { label: 'Status', value: paid ? 'Paid' : 'Open' },
        { label: 'Client', value: client },
        { label: 'Stripe invoice', value: invoice.stripe_invoice_id || 'Not created', mono: true },
      ]} /></div>
      <div {...stylex.props(content.twoCol)}>
        <Section title="Invoice PDF" description="The customer-ready invoice and its evidence appendix">
          <iframe title={`Invoice PDF for ${client}`} src={invoicePath} {...stylex.props(content.pdf)} />
        </Section>
        <Section title="Evidence trail" description="Why this amount was billed">
          {evidence.length ? (
            <div {...stylex.props(content.stack)}>
              <div id="evidence-quote" {...stylex.props(content.evidence)}><Text role="label">Client quote</Text><Text role="compact">“{evidence[0].quote}”</Text></div>
              <div id="evidence-memory" {...stylex.props(content.evidence)}><Text role="label">Remembered agreement</Text><Text role="compact">{evidence[0].memoryFact}</Text></div>
              <div {...stylex.props(content.evidence)}><Text role="label">Arithmetic</Text><span {...stylex.props(content.math)}>{arithmetic(event, invoice.total_pence)}</span></div>
              <div {...stylex.props(content.evidence)}><Text role="label">Policy clauses</Text><div {...stylex.props(content.clauseList)}>{evidence[0].clauses.map((clause) => <Link key={clause} to={`/app/policy#policy-${clause}`} {...stylex.props(content.clause)}>{clause}</Link>)}</div></div>
            </div>
          ) : <div {...stylex.props(content.well)}><Text role="compact">No evidence event is available for this invoice.</Text></div>}
        </Section>
      </div>
    </Page>
  )
}
