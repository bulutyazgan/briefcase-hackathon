import type { AppState } from '../../api'
import { DataTable } from '../../components/ui/data-table'
import type { DataTableColumn } from '../../components/ui/data-table'
import { Page, Opening, Section } from '../../components/ui/page'
import { StatStrip } from '../../components/ui/stat-strip'
import { Control } from '../control/view'

const clauses = [
  { id: 'P1', rule: 'Bill only from a client message that contains an explicit commitment (“let’s do”, “go ahead”, “order”, a quantity).', value: 'Explicit client quote', enforcedBy: 'extractIntent()' },
  { id: 'P2', rule: 'Prices come from the rate card only. Lead list £4/lead, setup £0.', value: '£4.00 per lead', enforcedBy: 'RATE_PENCE' },
  { id: 'P3', rule: 'Discounts only if remembered as agreed (Cognee fact with date) and never above 15%.', value: '15% discount cap', enforcedBy: 'discountFromFacts()' },
  { id: 'P4', rule: 'Auto-send invoices up to £1,000. Above that, one approval from the account owner.', value: '£1,000 auto-send limit', enforcedBy: 'decide()' },
  { id: 'P5', rule: 'Known clients only (Stripe customer exists or is in the client list). Unknown → ask, do not bill.', value: 'Known clients only', enforcedBy: 'findClient()' },
  { id: 'P6', rule: 'One invoice per commitment message (idempotency).', value: 'One invoice per message', enforcedBy: 'createInvoice()' },
  { id: 'P7', rule: 'Reminders at most once per 24 h, and never after a remembered dispute.', value: 'Once per 24 hours', enforcedBy: 'pollInvoices()' },
]

export function Policy({ state }: { state?: AppState }) {
  const columns: DataTableColumn<(typeof clauses)[number]>[] = [
    { key: 'clause', label: 'Clause', mono: true, render: (clause) => clause.id, sortValue: (clause) => clause.id },
    { key: 'rule', label: 'Rule', render: (clause) => clause.rule, searchValue: (clause) => `${clause.rule} ${clause.value}` },
    { key: 'value', label: 'Threshold / value', render: (clause) => clause.value },
    { key: 'enforced', label: 'Enforced by', mono: true, render: (clause) => clause.enforcedBy },
    { key: 'applied', label: 'Last applied', align: 'end', render: (clause) => state ? state.events.filter((event) => event.policy_clause?.includes(clause.id)).length : '—' },
  ]
  return (
    <Page>
      <Opening title="Billing follows the client’s written agreement" lede="Seven rules keep autonomous collection inside clear limits." />
      <StatStrip items={[
        { label: 'Policy clauses', value: '7', mono: true },
        { label: 'Approval threshold', value: '£1,000', mono: true },
        { label: 'Maximum discount', value: '15%', mono: true },
      ]} />
      <Section title="Billing policy" description="Each decision cites the clause it uses">
        <DataTable rows={clauses} columns={columns} rowKey={(clause) => clause.id} emptyTitle="No policy clauses" />
      </Section>
      <Control />
    </Page>
  )
}
