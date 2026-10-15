import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'
import { styles } from './app-shell.stylex'
import { AppSidebar } from './app-sidebar'

export function AppShell({ path, invoiceCount, pendingCount, leadsCount, children }: { path: string; invoiceCount: number; pendingCount: number; leadsCount: number; children: ReactNode }) {
  return <div {...stylex.props(styles.viewport)}><AppSidebar path={path} invoiceCount={invoiceCount} pendingCount={pendingCount} leadsCount={leadsCount} /><div {...stylex.props(styles.content)}>{children}</div></div>
}
