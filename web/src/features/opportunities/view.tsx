import * as stylex from '@stylexjs/stylex'
import { Page, Opening, Section } from '../../components/ui/page'
import { StatStrip } from '../../components/ui/stat-strip'
import { Text } from '../../components/ui/text'
import { content } from '../../components/ui/content.stylex'

// The opportunities layer has no endpoint on this base yet; the page holds its place in the shell.
const stages = ['Spotted', 'Offered', 'Accepted', 'Billed'] as const

export function Opportunities() {
  return (
    <Page>
      <Opening title="No opportunities in the pipeline" lede="Upsells Tally spots move from offered to accepted to billed, each with its rationale, evidence, clauses and amount." />
      <StatStrip items={stages.map((stage) => ({ label: stage, value: 0, mono: true }))} />
      <Section title="Opportunities" description="Rationale, evidence and clauses per opportunity">
        <div {...stylex.props(content.well)}><Text role="compact">Tally has not spotted an opportunity yet.</Text></div>
      </Section>
    </Page>
  )
}
