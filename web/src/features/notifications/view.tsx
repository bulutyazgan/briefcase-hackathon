import type { AppState, EventRow } from '../../api'
import { DataTable } from '../../components/ui/data-table'
import type { DataTableColumn } from '../../components/ui/data-table'
import { Opening, Page, Section } from '../../components/ui/page'
import { StatStrip } from '../../components/ui/stat-strip'

export const NOTIFICATION_STEPS: Record<string, string> = {
  staff_note: 'Staff note',
  client_identified: 'Client found',
  onboard: 'New client',
  plan_change: 'Plan change',
  company_learned: 'Company learned',
}

export function notificationsOf(state: AppState): EventRow[] {
  return state.events
    .filter((event) => event.step in NOTIFICATION_STEPS)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
}

export function Notifications({ state }: { state: AppState }) {
  const rows = notificationsOf(state)
  const columns: DataTableColumn<EventRow>[] = [
    { key: 'time', label: 'Time', mono: true, width: '180px', render: (event) => new Date(event.created_at).toLocaleString('en-GB'), sortValue: (event) => event.created_at },
    { key: 'kind', label: 'Type', width: '160px', render: (event) => NOTIFICATION_STEPS[event.step] ?? event.step, sortValue: (event) => event.step, searchValue: (event) => NOTIFICATION_STEPS[event.step] ?? event.step },
    { key: 'note', label: 'Note', render: (event) => event.summary, searchValue: (event) => event.summary },
    { key: 'clauses', label: 'Clauses', mono: true, width: '110px', render: (event) => event.policy_clause || '—' },
  ]
  return (
    <Page>
      <Opening title="Notifications" lede="What Tally changed for clients in chat, so staff never have to ask." />
      <StatStrip items={[
        { label: 'Staff notes', value: rows.filter((event) => event.step === 'staff_note').length, mono: true },
        { label: 'Plan changes', value: rows.filter((event) => event.step === 'plan_change').length, mono: true },
        { label: 'Clients found or onboarded', value: rows.filter((event) => event.step === 'client_identified' || event.step === 'onboard').length, mono: true },
      ]} />
      <Section title="Latest" description="Newest first, updated live">
        <DataTable rows={rows} columns={columns} rowKey={(event) => event.id} searchPlaceholder="Search notifications" emptyTitle="No notifications yet" emptyBody="When Tally changes a plan or onboards a client in chat, a note for staff appears here." />
      </Section>
    </Page>
  )
}
