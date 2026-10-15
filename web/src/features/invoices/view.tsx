import * as stylex from '@stylexjs/stylex'
import type { AppState, InvoiceRow } from '../../api'
import { evidenceFromEvent } from './api'
import { styles } from './invoices.stylex'

interface InvoicesProps {
  state: AppState
  selectedInvoiceId: string
  onSelect: (invoiceId: string) => void
}

function formatMoney(amountPence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amountPence / 100)
}

function InvoiceDetail({ invoice, state }: { invoice: InvoiceRow; state: AppState }) {
  const decisionEvent = state.events.find((event) =>
    event.message_id === invoice.message_id && event.step === 'decide',
  )
  const evidence = evidenceFromEvent(decisionEvent)
  return (
    <div {...stylex.props(styles.detail)}>
      <p {...stylex.props(styles.amount)}>{formatMoney(invoice.total_pence)}</p>
      <span {...stylex.props(styles.status)}>{invoice.status}</span>
      <div {...stylex.props(styles.links)}>
        {invoice.hosted_url && <a href={invoice.hosted_url} target="_blank" rel="noreferrer" {...stylex.props(styles.link)}>Open Stripe invoice</a>}
        <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" {...stylex.props(styles.link)}>View PDF</a>
        <a href={`/api/leads/${invoice.id}.csv`} {...stylex.props(styles.link)}>Download lead list</a>
      </div>
      <h3 {...stylex.props(styles.evidenceTitle)}>Evidence for this invoice</h3>
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
  )
}

export function Invoices({ state, selectedInvoiceId, onSelect }: InvoicesProps) {
  const selectedInvoice = state.invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? state.invoices[0]
  return (
    <section {...stylex.props(styles.panel)} aria-labelledby="invoices-title">
      <header {...stylex.props(styles.header)}>
        <h2 id="invoices-title" {...stylex.props(styles.title)}>Invoices</h2>
        <p {...stylex.props(styles.subtitle)}>Policy checked · evidence attached to each line</p>
      </header>
      {state.invoices.length
        ? (
          <>
            <div {...stylex.props(styles.list)}>
              {state.invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  type="button"
                  aria-pressed={selectedInvoice?.id === invoice.id}
                  {...stylex.props(styles.invoiceButton, selectedInvoice?.id === invoice.id && styles.selectedInvoice)}
                  onClick={() => onSelect(invoice.id)}
                >
                  <span>{invoice.stripe_invoice_id ?? invoice.id.slice(0, 10)}</span>
                  <span>{formatMoney(invoice.total_pence)} · {invoice.status}</span>
                </button>
              ))}
            </div>
            {selectedInvoice && <InvoiceDetail invoice={selectedInvoice} state={state} />}
          </>
        )
        : <p {...stylex.props(styles.empty)}>No invoices yet. Send a commitment to see its price and evidence here.</p>}
    </section>
  )
}
