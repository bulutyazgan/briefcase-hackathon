import * as stylex from '@stylexjs/stylex'
import { motion } from 'motion/react'
import { styles } from './thinking-state.stylex'

const attribution = 'AICSS free component pattern · https://www.aicss.dev/components/thinking-state'

export function ThinkingState({ label = 'Tally is thinking' }: { label?: string }) {
  return <motion.span aria-label={label} title={attribution} {...stylex.props(styles.shimmer)}>Thinking</motion.span>
}
