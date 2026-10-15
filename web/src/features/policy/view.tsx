import * as stylex from '@stylexjs/stylex'
import { Page, Opening, Section } from '../../components/ui/page'
import { RowList, RowListItem } from '../../components/ui/row-list'
import { StatStrip } from '../../components/ui/stat-strip'
import { Text } from '../../components/ui/text'
import { content } from '../../components/ui/content.stylex'

const clauses = [
  ['P1', 'Bill only from a client message that contains an explicit commitment (“let’s do”, “go ahead”, “order”, a quantity).'],
  ['P2', 'Prices come from the rate card only. Lead list £4/lead, setup £0.'],
  ['P3', 'Discounts only if remembered as agreed (Cognee fact with date) and never above 15%.'],
  ['P4', 'Auto-send invoices up to £1,000. Above that, one approval from the account owner.'],
  ['P5', 'Known clients only (Stripe customer exists or is in the client list). Unknown → ask, do not bill.'],
  ['P6', 'One invoice per commitment message (idempotency).'],
  ['P7', 'Reminders at most once per 24 h, and never after a remembered dispute.'],
] as const

export function Policy() {
  return (
    <Page>
      <Opening title="Billing follows the client’s written agreement" lede="Seven rules keep autonomous collection inside clear limits." />
      <StatStrip items={[
        { label: 'Policy clauses', value: '7', mono: true },
        { label: 'Approval threshold', value: '£1,000', mono: true },
        { label: 'Maximum discount', value: '15%', mono: true },
      ]} />
      <Section title="Billing policy" description="Each decision cites the clause it uses">
        <div {...stylex.props(content.card)}>
          <RowList>{clauses.map(([id, clause]) => <RowListItem key={id} id={id}>
            <div id={`policy-${id}`} {...stylex.props(content.row, content.full, content.alignTop)}>
              <span {...stylex.props(content.clause)}>{id}</span><Text role="body">{clause}</Text>
            </div>
          </RowListItem>)}</RowList>
        </div>
      </Section>
    </Page>
  )
}
