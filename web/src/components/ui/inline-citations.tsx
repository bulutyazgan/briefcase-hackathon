import * as stylex from '@stylexjs/stylex'
import { styles } from './inline-citations.stylex'

const attribution = 'AICSS free component pattern · https://www.aicss.dev/components/inline-citations'
export type InlineCitation = { label: string; href: string }

export function InlineCitations({ citations }: { citations: InlineCitation[] }) {
  return <span aria-label="Evidence citations" title={attribution} {...stylex.props(styles.list)}>{citations.map((citation, index) => <a key={`${citation.label}-${index}`} href={citation.href} {...stylex.props(styles.link)}>[{index + 1}] {citation.label}</a>)}</span>
}
