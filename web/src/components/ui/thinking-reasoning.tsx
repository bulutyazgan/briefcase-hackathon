import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'
import { styles } from './thinking-reasoning.stylex'

const attribution = 'AICSS free component pattern · https://www.aicss.dev/components/thinking-reasoning'

export type ThoughtStep = { name: string; detail: string }

export function ThinkingReasoning({ seconds, steps, open = false }: { seconds: number; steps: ThoughtStep[]; open?: boolean }) {
  return (
    <details title={attribution} open={open} {...stylex.props(styles.details)}>
      <summary {...stylex.props(styles.summary)}>Thought for {Math.max(1, seconds)} s</summary>
      <ol {...stylex.props(styles.list)}>
        {steps.map((step, index) => <li key={`${step.name}-${index}`} {...stylex.props(styles.step)}><strong {...stylex.props(styles.stepName)}>{step.name}</strong>{step.detail ? ` · ${step.detail}` : ''}</li>)}
      </ol>
    </details>
  )
}
