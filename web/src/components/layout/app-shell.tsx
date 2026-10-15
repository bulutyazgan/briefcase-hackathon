import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'
import { styles } from './app-shell.stylex'
import { AppSidebar } from './app-sidebar'

export function AppShell({ path, invoiceCount, pendingCount, leadsCount, notificationCount, readOnly, children }: { path: string; invoiceCount: number; pendingCount: number; leadsCount: number; notificationCount: number; readOnly: boolean; children: ReactNode }) {
  return <div {...stylex.props(styles.viewport)}><AppSidebar path={path} invoiceCount={invoiceCount} pendingCount={pendingCount} leadsCount={leadsCount} notificationCount={notificationCount} readOnly={readOnly} /><div {...stylex.props(styles.content)}>{children}</div></div>
}
