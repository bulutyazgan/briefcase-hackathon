import * as stylex from '@stylexjs/stylex'
import { motion } from 'motion/react'
import { createContext, useContext, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { spring } from '../../motion/springs'
import { styles } from './row-list.stylex'

type HoverContext = { group: string; active: string | null; setActive: (key: string | null) => void }
const RowHoverContext = createContext<HoverContext | null>(null)

export function RowList({ children }: { children: ReactNode }) {
  const group = useId().replaceAll(':', '')
  const [active, setActive] = useState<string | null>(null)
  return <RowHoverContext.Provider value={{ group, active, setActive }}><div {...stylex.props(styles.list)} role="list">{children}</div></RowHoverContext.Provider>
}

export function RowListItem({ id, children, separated = true }: { id: string; children: ReactNode; separated?: boolean }) {
  const context = useContext(RowHoverContext)
  const isActive = context?.active === id
  return (
    <div
      {...stylex.props(styles.item, separated && styles.separator)}
      role="listitem"
      onPointerEnter={() => context?.setActive(id)}
      onPointerLeave={() => context?.setActive(null)}
      onFocus={() => context?.setActive(id)}
      onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) context?.setActive(null) }}
    >
      {isActive && context ? <motion.span aria-hidden {...stylex.props(styles.highlight)} layoutId={`row-highlight-${context.group}`} transition={spring.moderate} /> : null}
      {children}
    </div>
  )
}
