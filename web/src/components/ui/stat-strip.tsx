import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'
import { styles } from './stat-strip.stylex'

export type StatItem = { label: string; value: ReactNode; mono?: boolean }

export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div {...stylex.props(styles.strip)} role="list">
      {items.map((item) => <div key={item.label} {...stylex.props(styles.item)} role="listitem"><span {...stylex.props(styles.label)}>{item.label}</span><span {...stylex.props(styles.value, item.mono && styles.mono)}>{item.value}</span></div>)}
    </div>
  )
}
