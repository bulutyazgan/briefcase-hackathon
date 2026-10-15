import * as stylex from '@stylexjs/stylex'
import { useState } from 'react'
import type { AppState, InvoiceRow } from '../../api'
import { evidenceFromEvent, simulateInvoicePayment } from './api'
import { styles } from './invoices.stylex'

interface InvoicesProps {
  state: AppState
  mode: 'list' | 'detail'
  selectedInvoiceId?: string
  onSelect: (invoiceId: string) => void
}

function formatMoney(amountPence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amountPence / 100)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function invoiceClientName(invoice: InvoiceRow, state: AppState): string {
  const evidenceEvents = state.events.filter((event) =>
    event.message_id === invoice.message_id && (event.step === 'decide' || event.step === 'extract'),
  )
  for (const event of evidenceEvents) {
    try {
      const data: unknown = JSON.parse(event.data_json)
      if (isRecord(data) && isRecord(data.intent) && typeof data.intent.clientName === 'string') {
        return data.intent.clientName
      }
    } catch {
      continue
    }
  }
  const author = state.messages.find((message) => message.id === invoice.message_id)?.author
  return author?.replace(/^Client — /, '') || invoice.client_id || 'Client not recorded'
}

function InvoiceDetail({ invoice, state }: { invoice: InvoiceRow; state: AppState }) {
  const [paying, setPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const decisionEvent = state.events.find((event) =>
    event.message_id === invoice.message_id && event.step === 'decide',
  )
  const evidence = evidenceFromEvent(decisionEvent)
  const clientName = invoiceClientName(invoice, state)

  async function payWithTestCard(): Promise<void> {
    setPaying(true)
    setPaymentError('')
    try {
      await simulateInvoicePayment(invoice.id)
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Test payment failed.')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div {...stylex.props(styles.detailLayout)}>
      <div {...stylex.props(styles.detail)}>
        <div {...stylex.props(styles.amountLine)}>
          <p {...stylex.props(styles.amount)}>{formatMoney(invoice.total_pence)}</p>
          <span {...stylex.props(styles.status, invoice.status === 'paid' ? styles.statusPaid : styles.statusOpen)}>
            {invoice.status}
          </span>
        </div>
        <dl {...stylex.props(styles.metadata)}>
          <div {...stylex.props(styles.metadataItem)}>
            <dt {...stylex.props(styles.label)}>Client</dt>
            <dd {...stylex.props(styles.metadataValue)}>{clientName}</dd>
          </div>
          <div {...stylex.props(styles.metadataItem)}>
            <dt {...stylex.props(styles.label)}>Stripe invoice ID</dt>
            <dd {...stylex.props(styles.identifier)}>{invoice.stripe_invoice_id ?? 'Not created'}</dd>
          </div>
          <div {...stylex.props(styles.metadataItem)}>
            <dt {...stylex.props(styles.label)}>Created</dt>
            <dd {...stylex.props(styles.identifier)}>
              <time dateTime={invoice.created_at}>
                {new Date(invoice.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
            </dd>
          </div>
        </dl>
        <div {...stylex.props(styles.links)}>
          <a href={`/api/leads/${invoice.id}.csv`} {...stylex.props(styles.link)}>Download lead list</a>
        </div>
        {invoice.status === 'open' && invoice.stripe_invoice_id && (
          <div {...stylex.props(styles.paymentAction)}>
            <button
              type="button"
              disabled={paying}
              {...stylex.props(styles.paymentButton)}
              onClick={() => void payWithTestCard()}
            >
              {paying ? 'Paying with test card…' : 'Pay as client (test card)'}
            </button>
            {paymentError && <p role="alert" {...stylex.props(styles.paymentError)}>{paymentError}</p>}
          </div>
        )}
        <h2 {...stylex.props(styles.evidenceTitle)}>Evidence</h2>
        {evidence.length
          ? evidence.map((line, index) => (
            <div key={`${line.quote}-${index}`} {...stylex.props(styles.evidence)}>
              <p {...stylex.props(styles.label)}>Client quote</p>
              <blockquote {...stylex.props(styles.quote)}>“{line.quote}”</blockquote>
              <p {...stylex.props(styles.label)}>Memory fact</p>
              <p {...stylex.props(styles.fact)}>{line.memoryFact}</p>
              <div {...stylex.props(styles.clauses)} aria-label="Policy clauses">
                {line.clauses.map((clause) => <span key={clause} {...stylex.props(styles.clause)}>{clause}</span>)}
              </div>
            </div>
          ))
          : <p {...stylex.props(styles.fact)}>Evidence is not available for this invoice.</p>}
      </div>
      <section {...stylex.props(styles.preview)} aria-labelledby="invoice-pdf-title">
        <header {...stylex.props(styles.previewHeader)}>
          <h2 id="invoice-pdf-title" {...stylex.props(styles.evidenceTitle)}>Invoice PDF</h2>
          {invoice.pdf_path && (
            <a href={`/api/invoices/${encodeURIComponent(invoice.id)}/pdf`} target="_blank" rel="noreferrer" {...stylex.props(styles.link)}>
              Open PDF
            </a>
          )}
        </header>
        {invoice.pdf_path
          ? (
            <iframe
              title={`Invoice PDF for ${clientName}`}
              src={`/api/invoices/${encodeURIComponent(invoice.id)}/pdf`}
              {...stylex.props(styles.pdfFrame)}
            />
          )
          : <p role="status" {...stylex.props(styles.pdfEmpty)}>The PDF is not available for this invoice.</p>}
      </section>
    </div>
  )
}

export function Invoices({ state, mode, selectedInvoiceId, onSelect }: InvoicesProps) {
  const selectedInvoice = selectedInvoiceId
    ? state.invoices.find((invoice) => invoice.id === selectedInvoiceId)
    : undefined

  if (mode === 'detail') {
    return selectedInvoice
      ? <InvoiceDetail invoice={selectedInvoice} state={state} />
      : <p role="status" {...stylex.props(styles.empty)}>Invoice not found. Return to the invoice list and choose another record.</p>
  }

  return (
    <section {...stylex.props(styles.panel)} aria-labelledby="invoice-list-title">
      <header {...stylex.props(styles.listHeader)}>
        <h2 id="invoice-list-title" {...stylex.props(styles.title)}>All invoices</h2>
        <span {...stylex.props(styles.listCount)}>{state.invoices.length} total</span>
      </header>
      {state.invoices.length
        ? (
          <div {...stylex.props(styles.list)}>
            {state.invoices.map((invoice) => (
              <button
                key={invoice.id}
                type="button"
                {...stylex.props(styles.invoiceButton)}
                onClick={() => onSelect(invoice.id)}
              >
                <span {...stylex.props(styles.invoiceClient)}>
                  <strong>{invoiceClientName(invoice, state)}</strong>
                  <span {...stylex.props(styles.identifier)}>{invoice.stripe_invoice_id ?? invoice.id}</span>
                </span>
                <span {...stylex.props(styles.invoiceTotals)}>
                  <strong {...stylex.props(styles.identifier)}>{formatMoney(invoice.total_pence)}</strong>
                  <span {...stylex.props(styles.status, invoice.status === 'paid' ? styles.statusPaid : styles.statusOpen)}>
                    {invoice.status}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )
        : <p {...stylex.props(styles.empty)}>No invoices yet. Send a client commitment from the inbox to create one.</p>}
    </section>
  )
}
