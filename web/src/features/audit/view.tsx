import type { AppState } from '../../api'
import { Page, Opening, Section } from '../../components/ui/page'
import { DataTable } from '../../components/ui/data-table'
import type { DataTableColumn } from '../../components/ui/data-table'
import { StatStrip } from '../../components/ui/stat-strip'

export function Audit({ state }: { state: AppState }) {
  const events = [...state.events].sort((left, right) => right.created_at.localeCompare(left.created_at))
  const uniqueMessages = new Set(events.map((event) => event.message_id)).size
  const columns: DataTableColumn<(typeof events)[number]>[] = [
    { key: 'time', label: 'Time', mono: true, render: (event) => new Date(event.created_at).toLocaleString('en-GB'), sortValue: (event) => event.created_at },
    { key: 'event', label: 'Event', render: (event) => event.step, sortValue: (event) => event.step, searchValue: (event) => event.step },
    { key: 'detail', label: 'Detail', render: (event) => event.summary, searchValue: (event) => `${event.summary} ${event.message_id}` },
    { key: 'clauses', label: 'Clauses', mono: true, render: (event) => event.policy_clause || '—', searchValue: (event) => event.policy_clause || '' },
  ]
  return (
    <Page>
      <Opening title={`${events.length} recorded decisions`} lede="Every agent action leaves a time-stamped trail." />
      <StatStrip items={[
        { label: 'Events', value: events.length, mono: true },
        { label: 'Commitments', value: uniqueMessages, mono: true },
        { label: 'Latest event', value: events[0] ? new Date(events[0].created_at).toLocaleDateString('en-GB') : 'No events' },
      ]} />
      <Section title="Audit trail" description="Most recent decisions appear first">
        <DataTable rows={events} columns={columns} rowKey={(event) => event.id} searchPlaceholder="Search events" emptyTitle="No agent actions have been recorded" emptyBody="Events will appear here as the agent processes commitments." />
      </Section>
    </Page>
  )
}
