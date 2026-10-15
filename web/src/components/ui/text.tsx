import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'
import { styles } from './text.stylex'

type TextRole = 'display' | 'title' | 'heading24' | 'heading20' | 'heading16' | 'lede' | 'body' | 'compact' | 'label' | 'mono'
type TextElement = 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3'

export function Text({ children, role = 'body', as = 'p' }: { children: ReactNode; role?: TextRole; as?: TextElement }) {
  const Tag = as
  return <Tag {...stylex.props(styles[role])}>{children}</Tag>
}
