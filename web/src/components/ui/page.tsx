import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'
import { styles } from './page.stylex'
import { Text } from './text'

export function Page({ children }: { children: ReactNode }) {
  return <main {...stylex.props(styles.page)}>{children}</main>
}

export function Opening({ title, lede, tools }: { title: ReactNode; lede?: ReactNode; tools?: ReactNode }) {
  return (
    <header {...stylex.props(styles.opening)}>
      <div {...stylex.props(styles.openingCopy)}>
        <Text role="title" as="h1">{title}</Text>
        {lede ? <Text role="lede">{lede}</Text> : null}
      </div>
      {tools ? <div {...stylex.props(styles.openingTools)}>{tools}</div> : null}
    </header>
  )
}

export function Section({ title, description, tools, children }: { title: ReactNode; description?: ReactNode; tools?: ReactNode; children: ReactNode }) {
  return (
    <section {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.sectionHeader)}>
        <div>
          <Text role="heading20" as="h2">{title}</Text>
          {description ? <Text role="compact">{description}</Text> : null}
        </div>
        {tools ? <div {...stylex.props(styles.openingTools)}>{tools}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function Closing({ children }: { children: ReactNode }) {
  return <footer {...stylex.props(styles.closing)}><Text role="compact">{children}</Text></footer>
}
