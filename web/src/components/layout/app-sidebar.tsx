import * as stylex from '@stylexjs/stylex'
import { styles } from './app-shell.stylex'
import { PrimarySidebar } from './primary-sidebar'

export function AppSidebar({ path, invoiceCount, pendingCount, leadsCount, notificationCount }: { path: string; invoiceCount: number; pendingCount: number; leadsCount: number; notificationCount: number }) {
  return <aside {...stylex.props(styles.sidebar)}><PrimarySidebar path={path} invoiceCount={invoiceCount} pendingCount={pendingCount} leadsCount={leadsCount} notificationCount={notificationCount} /></aside>
}
