import { useEffect, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Page, Opening, Section } from '../../components/ui/page'
import { StatStrip } from '../../components/ui/stat-strip'
import { Table, type TableColumn } from '../../components/ui/table'
import { Text } from '../../components/ui/text'
import { content } from '../../components/ui/content.stylex'
import { motion } from '../../motion.stylex'
import { useFreshIds } from '../../motion'
import { fetchBooks, journalsCsvUrl, type InvoiceBooks } from './api'

const MIN_MARGIN_RATIO = 0.4

function money(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

const columns: TableColumn<InvoiceBooks>[] = [
  { key: 'invoice', label: 'Invoice', mono: true, render: (row) => <Text role="mono">{row.reference}</Text> },
  { key: 'net', label: 'Net', mono: true, render: (row) => <Text role="mono">{money(row.netPence)}</Text> },
  { key: 'vat', label: 'VAT', mono: true, render: (row) => <Text role="mono">{money(row.vatPence)}</Text> },
  { key: 'gross', label: 'Gross', mono: true, render: (row) => <Text role="mono">{money(row.grossPence)}</Text> },
  { key: 'cost', label: 'Cost of sale', mono: true, render: (row) => <Text role="mono">{money(row.costPence)}</Text> },
  {
    key: 'margin',
    label: 'Margin',
    mono: true,
    render: (row) => (
      <span {...stylex.props(content.clauseList)}>
        <Text role="mono">{money(row.marginPence)}{row.marginRatio !== null ? ` · ${Math.round(row.marginRatio * 100)}%` : ''}</Text>
        {row.marginRatio !== null && row.marginRatio < MIN_MARGIN_RATIO ? <span {...stylex.props(content.tag)}>Low margin</span> : null}
      </span>
    ),
  },
  { key: 'status', label: 'Status', render: (row) => <span {...stylex.props(content.status)}>{row.paid ? 'Paid' : 'Open'}</span> },
]

export function Books() {
  const [invoices, setInvoices] = useState<InvoiceBooks[] | null>(null)
  const [error, setError] = useState('')
  const rows = invoices ?? []
  const fresh = useFreshIds('books', rows.map((invoice) => invoice.invoiceId))

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

  const sum = (pick: (row: InvoiceBooks) => number) => rows.reduce((total, row) => total + pick(row), 0)
  const title = rows.length ? `${money(sum((row) => row.grossPence))} on the books` : 'Nothing on the books yet'

  return (
    <Page>
      <Opening
        title={title}
        lede="Double-entry journals, UK VAT at 20% and the margin on every invoice."
        tools={<a href={journalsCsvUrl} {...stylex.props(content.link)}>Export journals CSV</a>}
      />
      <StatStrip items={[
        { label: 'Invoices', value: rows.length, mono: true },
        { label: 'Net billed', value: money(sum((row) => row.netPence)), mono: true },
        { label: 'VAT', value: money(sum((row) => row.vatPence)), mono: true },
        { label: 'Margin', value: money(sum((row) => row.marginPence)), mono: true },
      ]} />
      <Section title="Books" description="Journals post when an invoice is finalised">
        {error ? <p role="alert" {...stylex.props(content.error)}>{error}</p> : null}
        {rows.length
          ? <Table
              rows={rows}
              columns={columns}
              rowKey={(row) => row.invoiceId}
              rowProps={(row) => {
                const index = fresh.get(row.invoiceId)
                return stylex.props(index !== undefined && motion.enterUp, index !== undefined && motion.staggerTight(index))
              }}
            />
          : <div {...stylex.props(content.well)}><Text role="compact">Journals post when an invoice is finalised.</Text></div>}
      </Section>
    </Page>
  )
}
