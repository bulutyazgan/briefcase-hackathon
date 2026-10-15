import * as stylex from '@stylexjs/stylex'
import type { EventRow } from '../../api'
import { auditEvents } from './api'
import { styles } from './audit.stylex'

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
  approval: 'Approval',
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

export function Audit({ events }: { events: EventRow[] }) {
  const recentEvents = auditEvents(events)
  return (
    <section {...stylex.props(styles.panel)} aria-labelledby="audit-title">
      <header {...stylex.props(styles.header)}>
        <h2 id="audit-title" {...stylex.props(styles.title)}>Audit trail</h2>
        <p {...stylex.props(styles.subtitle)}>Every decision has a source and a policy clause</p>
      </header>
      {recentEvents.length
        ? (
          <div {...stylex.props(styles.timeline)} aria-live="polite">
            {recentEvents.map((event) => {
              const clauses = clausesOf(event.policy_clause)
              return (
                <article key={event.id} {...stylex.props(styles.event)}>
                  <time dateTime={event.created_at} {...stylex.props(styles.time)}>
                    {new Date(event.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  </time>
                  <div>
                    <div {...stylex.props(styles.name)}>{labelFor(event.step)}</div>
                    <p {...stylex.props(styles.summary)}>{event.summary}</p>
                    {clauses.length > 0 && (
                      <ul {...stylex.props(styles.clauseList)} aria-label="Policy clauses">
                        {clauses.map((clause) => (
                          <li key={clause} {...stylex.props(styles.clause)}>{clause}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )
        : <p {...stylex.props(styles.empty)}>The audit trail will show each agent step here.</p>}
    </section>
  )
}
