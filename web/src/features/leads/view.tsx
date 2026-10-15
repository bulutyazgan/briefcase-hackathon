import { useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import type { AppState, SourcedLead } from '../../api'
import { Button } from '../../components/ui/button'
import { DataTable } from '../../components/ui/data-table'
import type { DataTableColumn } from '../../components/ui/data-table'
import { Page, Opening, Section } from '../../components/ui/page'
import { StatStrip } from '../../components/ui/stat-strip'
import { Text } from '../../components/ui/text'
import { content } from '../../components/ui/content.stylex'
import { Link } from '../../router'

type Filter = 'all' | 'delivered' | 'awaiting'

export function Leads({ state, leads }: { state: AppState; leads: SourcedLead[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const clients = new Set(leads.map((lead) => lead.clientName))
  const delivered = leads.filter((lead) => lead.invoiceStatus === 'paid').length
  const waiting = leads.length - delivered
  const filtered = leads.filter((lead) => filter === 'all' || (filter === 'delivered' ? lead.invoiceStatus === 'paid' : lead.invoiceStatus !== 'paid'))
  const columns: DataTableColumn<SourcedLead>[] = [
    { key: 'name', label: 'Name', render: (lead) => lead.name, sortValue: (lead) => lead.name, searchValue: (lead) => lead.name },
    { key: 'company', label: 'Company', render: (lead) => lead.company, sortValue: (lead) => lead.company, searchValue: (lead) => lead.company },
    { key: 'source', label: 'Source', render: (lead) => <a href={lead.url} target="_blank" rel="noreferrer" {...stylex.props(content.link)}>Open source</a> },
    { key: 'client', label: 'Client', render: (lead) => lead.clientName, sortValue: (lead) => lead.clientName, searchValue: (lead) => lead.clientName },
    { key: 'invoice', label: 'Invoice', render: (lead) => <Link to={`/app/invoices/${encodeURIComponent(lead.invoiceId)}`} {...stylex.props(content.link)}>{lead.invoiceId.slice(0, 8)}</Link>, sortValue: (lead) => lead.invoiceId },
    { key: 'status', label: 'Status', render: (lead) => <Text role="compact">{lead.invoiceStatus}</Text>, sortValue: (lead) => lead.invoiceStatus },
  ]
  const toolbar = <div {...stylex.props(content.row)} role="group" aria-label="Filter by payment status">
    {(['all', 'delivered', 'awaiting'] as const).map((value) => <Button key={value} variant={filter === value ? 'primary' : 'quiet'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'delivered' ? 'Delivered' : 'Awaiting payment'}</Button>)}
  </div>
  return <Page>
    <Opening title={`${leads.length} leads sourced for ${clients.size} ${clients.size === 1 ? 'client' : 'clients'}`} lede="A searchable record of every sourced prospect and the invoice that funds it." />
    <StatStrip items={[
      { label: 'Leads', value: leads.length, mono: true },
      { label: 'Delivered', value: delivered, mono: true },
      { label: 'Awaiting payment', value: waiting, mono: true },
    ]} />
    <Section title="Lead directory" description={`Filtered from ${state.invoices.length} invoices`}>
      <DataTable rows={filtered} columns={columns} rowKey={(lead) => lead.id} searchPlaceholder="Search name, company or client" toolbar={toolbar} emptyTitle="No leads have been sourced" emptyBody="Sourced leads will appear here with their invoice and client." />
    </Section>
  </Page>
}
