import * as stylex from '@stylexjs/stylex'
import type { EventRow } from '../../api'
import { auditEvents } from './api'
import { styles } from './audit.stylex'

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
            {recentEvents.map((event) => (
              <article key={event.id} {...stylex.props(styles.event)}>
                <time dateTime={event.created_at} {...stylex.props(styles.time)}>
                  {new Date(event.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
                <div>
                  <div {...stylex.props(styles.name)}>{event.step.replaceAll('_', ' ')}</div>
                  <p {...stylex.props(styles.summary)}>{event.summary}</p>
                  {event.policy_clause && <div {...stylex.props(styles.clauseList)}>{event.policy_clause}</div>}
                </div>
              </article>
            ))}
          </div>
        )
        : <p {...stylex.props(styles.empty)}>The audit trail will show each agent step here.</p>}
    </section>
  )
}
