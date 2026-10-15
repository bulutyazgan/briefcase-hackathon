import * as stylex from '@stylexjs/stylex'
import { styles } from './app-shell.stylex'
import { PrimarySidebar } from './primary-sidebar'

export function AppSidebar({ path, invoiceCount, pendingCount }: { path: string; invoiceCount: number; pendingCount: number }) {
  return <aside {...stylex.props(styles.sidebar)}><PrimarySidebar path={path} invoiceCount={invoiceCount} pendingCount={pendingCount} /></aside>
}
