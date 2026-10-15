import * as stylex from '@stylexjs/stylex'
import type { AppState } from '../../api'
import { Page, Opening, Section } from '../../components/ui/page'
import { RowList, RowListItem } from '../../components/ui/row-list'
import { StatStrip } from '../../components/ui/stat-strip'
import { Text } from '../../components/ui/text'
import { content } from '../../components/ui/content.stylex'
import { formatMoneyText } from '../../format'
import { motion } from '../../motion.stylex'
import { useFreshIds } from '../../motion'
import { Link } from '../../router'

// Every step name the server records, in the order the agent reaches them.
const stepLabel: Record<string, string> = {
  extract: 'Commitment extracted',
  extract_blocked: 'Extraction blocked',
  recall: 'Memory recalled',
  discount: 'Discount applied',
  price: 'Priced from rate card',
  source: 'Leads sourced',
  size: 'Order sized',
  margin: 'Margin checked',
  decide: 'Policy decision',
  approval: 'Approval requested',
  approve: 'Approved',
  bill: 'Invoice created',
  billing_blocked: 'Billing blocked',
  render: 'Invoice PDF rendered',
  remember: 'Memory updated',
  deliver: 'Delivered',
  explain: 'Invoice explained',
  paid: 'Invoice paid',
  invoice: 'Invoice issued',
  meter: 'Usage metered',
  credit_note: 'Credit note issued',
  dispute_extract: 'Dispute extracted',
  dispute_check: 'Dispute checked',
  kill_switch: 'Kill switch',
  kill_switch_blocked: 'Blocked by kill switch',
  collections_reminder: 'Payment reminder sent',
  collections_skip: 'Reminder skipped',
  upsell_offer: 'Upsell offered',
  counter_offer: 'Counter offer',
  buyer_order: 'Buyer order placed',
  buyer_pay: 'Buyer paid',
  buyer_reject: 'Buyer declined',
  error: 'Error',
}

function labelFor(step: string): string {
  return stepLabel[step] ?? step.replaceAll('_', ' ')
}

function clausesOf(policyClause: string | null): string[] {
  return policyClause ? policyClause.split(/[,\s]+/).filter(Boolean) : []
}

export function Audit({ state }: { state: AppState }) {
  const events = [...state.events].sort((left, right) => right.created_at.localeCompare(left.created_at))
  const uniqueMessages = new Set(events.map((event) => event.message_id)).size
  const fresh = useFreshIds('audit', events.map((event) => String(event.id)))
  return (
    <Page>
      <Opening title={`${events.length} recorded decisions`} lede="Every agent action leaves a time-stamped trail." />
      <StatStrip items={[
        { label: 'Events', value: events.length, mono: true },
        { label: 'Commitments', value: uniqueMessages, mono: true },
        { label: 'Latest event', value: events[0] ? new Date(events[0].created_at).toLocaleDateString('en-GB') : 'No events' },
      ]} />
      <Section title="Audit trail" description="Most recent decisions appear first">
        {events.length ? <div {...stylex.props(content.card)}>
          <RowList>{events.map((event) => {
            const freshIndex = fresh.get(String(event.id))
            const clauses = clausesOf(event.policy_clause)
            return <RowListItem key={event.id} id={event.id}>
              <div {...stylex.props(content.stack, content.full, freshIndex !== undefined && motion.enterUp, freshIndex !== undefined && motion.staggerTight(freshIndex))}>
                <div {...stylex.props(content.row)}><Text role="heading16">{formatMoneyText(event.summary)}</Text><span {...stylex.props(content.timestamp)}>{new Date(event.created_at).toLocaleString('en-GB')}</span></div>
                <div {...stylex.props(content.row, content.alignTop)}>
                  <span {...stylex.props(content.tag)} title={event.step}>{labelFor(event.step)}</span>
                  {clauses.length ? <span {...stylex.props(content.clauseList)}>{clauses.map((clause) => <Link key={clause} to={`/app/policy#policy-${clause}`} {...stylex.props(content.clause)}>{clause}</Link>)}</span> : null}
                </div>
                <Text role="mono">{event.message_id}</Text>
              </div>
            </RowListItem>
          })}</RowList>
        </div> : <div {...stylex.props(content.well)}><Text role="compact">No agent actions have been recorded yet.</Text></div>}
      </Section>
    </Page>
  )
}
