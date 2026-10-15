import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'
import { styles } from './text-response.stylex'

const attribution = 'AICSS free component pattern · https://www.aicss.dev/components/text-response'

export function TextResponse({ children }: { children: ReactNode }) {
  return <div aria-label="Tally response" title={attribution} {...stylex.props(styles.prose)}>{children}</div>
}
