import { useEffect, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { fetchBooks, journalsCsvUrl, type InvoiceBooks } from './api'
import { styles } from './books.stylex'

const MIN_MARGIN_RATIO = 0.4

function formatMoney(amountPence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amountPence / 100)
}

const columns = ['Invoice', 'Net', 'VAT', 'Gross', 'Cost of sale', 'Margin', 'Status'] as const

export function Books() {
  const [invoices, setInvoices] = useState<InvoiceBooks[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const load = () => {
      fetchBooks()
        .then((next) => { if (alive) { setInvoices(next); setError('') } })
        .catch((reason: unknown) => { if (alive) setError(String(reason)) })
    }
    load()
    const timer = setInterval(load, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  return (
    <section {...stylex.props(styles.panel)} aria-labelledby="books-title">
      <header {...stylex.props(styles.header)}>
        <div>
          <h2 id="books-title" {...stylex.props(styles.title)}>Books</h2>
          <p {...stylex.props(styles.subtitle)}>Double-entry journals · UK VAT 20% · margin per invoice</p>
        </div>
        <a href={journalsCsvUrl} {...stylex.props(styles.link)}>Export journals CSV</a>
      </header>
      {error && <p role="alert" {...stylex.props(styles.message, styles.warning)}>{error}</p>}
      {invoices && !invoices.length && <p {...stylex.props(styles.message)}>Journals post when an invoice is finalised.</p>}
      {invoices && invoices.length > 0 && (
        <div {...stylex.props(styles.scroll)}>
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={column} scope="col" {...stylex.props(styles.cell, styles.headCell, index === 0 && styles.first)}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.invoiceId}>
                  <td {...stylex.props(styles.cell, styles.first)}>{invoice.reference}</td>
                  <td {...stylex.props(styles.cell)}>{formatMoney(invoice.netPence)}</td>
                  <td {...stylex.props(styles.cell)}>{formatMoney(invoice.vatPence)}</td>
                  <td {...stylex.props(styles.cell)}>{formatMoney(invoice.grossPence)}</td>
                  <td {...stylex.props(styles.cell)}>{formatMoney(invoice.costPence)}</td>
                  <td {...stylex.props(styles.cell, invoice.marginRatio !== null && invoice.marginRatio < MIN_MARGIN_RATIO ? styles.low : styles.good)}>
                    {formatMoney(invoice.marginPence)}
                    {invoice.marginRatio !== null && ` · ${Math.round(invoice.marginRatio * 100)}%`}
                  </td>
                  <td {...stylex.props(styles.cell)}>{invoice.paid ? 'Paid' : 'Open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
