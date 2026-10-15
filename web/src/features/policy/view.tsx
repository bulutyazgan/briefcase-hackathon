import * as stylex from '@stylexjs/stylex'
import { tokens } from '../../tokens/tokens.stylex'

const clauses = [
  { id: 'P1', text: 'Bill only from a client message that contains an explicit commitment ("let\'s do", "go ahead", "order", a quantity).' },
  { id: 'P2', text: 'Prices come from the rate card only. Lead list £4/lead, setup £0.' },
  { id: 'P3', text: 'Discounts only if remembered as agreed (a remembered fact with a date) and never above 15%.' },
  { id: 'P4', text: 'Auto-send invoices up to £1,000. Above that, one approval from the account owner.' },
  { id: 'P5', text: 'Known clients only (Stripe customer exists or is in the client list). Unknown → ask, do not bill.' },
  { id: 'P6', text: 'One invoice per commitment message (idempotency).' },
  { id: 'P7', text: 'Reminders at most once per 24 h, and never after a remembered dispute.' },
] as const

const styles = stylex.create({
  list: {
    borderTopColor: tokens.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  clause: {
    display: 'grid',
    gridTemplateColumns: '48px minmax(0, 1fr)',
    gap: tokens.space3,
    alignItems: 'start',
    paddingBlock: tokens.space4,
    borderBottomColor: tokens.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  id: {
    color: tokens.accentDeep,
    fontFamily: tokens.fontMono,
    fontSize: tokens.textSmall,
    fontWeight: tokens.weightMedium,
  },
  text: {
    color: tokens.ink,
    fontSize: tokens.textBody,
    lineHeight: tokens.textLine,
    marginBlockStart: 0,
    marginBlockEnd: 0,
  },
})

export function Policy() {
  return (
    <section aria-label="Billing policy rules" {...stylex.props(styles.list)}>
      {clauses.map((clause) => (
        <article key={clause.id} {...stylex.props(styles.clause)}>
          <span {...stylex.props(styles.id)}>{clause.id}</span>
          <p {...stylex.props(styles.text)}>{clause.text}</p>
        </article>
      ))}
    </section>
  )
}
