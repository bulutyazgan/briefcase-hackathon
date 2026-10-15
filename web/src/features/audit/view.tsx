import * as stylex from '@stylexjs/stylex'
import type { AppState } from '../../api'
import { Page, Opening, Section } from '../../components/ui/page'
import { RowList, RowListItem } from '../../components/ui/row-list'
import { StatStrip } from '../../components/ui/stat-strip'
import { Text } from '../../components/ui/text'
import { content } from '../../components/ui/content.stylex'

export function Audit({ state }: { state: AppState }) {
  const events = [...state.events].sort((left, right) => right.created_at.localeCompare(left.created_at))
  const uniqueMessages = new Set(events.map((event) => event.message_id)).size
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
          <RowList>{events.map((event) => <RowListItem key={event.id} id={event.id}>
            <div {...stylex.props(content.stack, content.full)}>
              <div {...stylex.props(content.row)}><Text role="heading16">{event.summary}</Text><span {...stylex.props(content.timestamp)}>{new Date(event.created_at).toLocaleString('en-GB')}</span></div>
              <div {...stylex.props(content.row)}><span {...stylex.props(content.tag)}>{event.step}</span>{event.policy_clause ? <Text role="mono">{event.policy_clause}</Text> : null}</div>
              <Text role="mono">{event.message_id}</Text>
            </div>
          </RowListItem>)}</RowList>
        </div> : <div {...stylex.props(content.well)}><Text role="compact">No agent actions have been recorded yet.</Text></div>}
      </Section>
    </Page>
  )
}
