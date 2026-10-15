import * as stylex from '@stylexjs/stylex'
import { Activity, BookOpen, FileText, MessageSquareText, ShieldCheck, Sparkles } from 'lucide-react'
import { useControlStatus } from '../../features/control/use-control-status'
import { Link } from '../../router'
import { styles } from './app-shell.stylex'

const items = [
  { label: 'Inbox', path: '/app/inbox', icon: MessageSquareText, key: 'inbox' },
  { label: 'Invoices', path: '/app/invoices', icon: FileText, key: 'invoices' },
  { label: 'Opportunities', path: '/app/opportunities', icon: Sparkles, key: 'opportunities' },
  { label: 'Books', path: '/app/books', icon: BookOpen, key: 'books' },
  { label: 'Audit', path: '/app/audit', icon: Activity, key: 'audit' },
  { label: 'Policy', path: '/app/policy', icon: ShieldCheck, key: 'policy' },
] as const

export function PrimarySidebar({ path, invoiceCount, pendingCount }: { path: string; invoiceCount: number; pendingCount: number }) {
  const active = path.startsWith('/app/invoices') ? 'invoices' : path.split('/')[2]
  const { status } = useControlStatus()
  return (
    <>
      <Link to="/app/inbox" {...stylex.props(styles.brand)}><span aria-hidden="true" {...stylex.props(styles.brandDot)} />Tally</Link>
      <nav aria-label="Main navigation" {...stylex.props(styles.nav)}>
        {items.map((item) => {
          const count = item.key === 'inbox' ? pendingCount : item.key === 'invoices' ? invoiceCount : undefined
          const Icon = item.icon
          return <Link key={item.key} to={item.path} aria-current={active === item.key ? 'page' : undefined} {...stylex.props(styles.navLink, active === item.key && styles.active)}><span><Icon size={16} aria-hidden="true" /> {item.label}</span>{count !== undefined ? <span {...stylex.props(styles.badge)} aria-label={`${count} ${item.key === 'inbox' ? 'pending approvals' : 'invoices'}`}>{count}</span> : null}</Link>
        })}
      </nav>
      <div {...stylex.props(styles.footer)}>
        <span {...stylex.props(styles.mode)}><span aria-hidden="true" {...stylex.props(styles.modeDot)} />Stripe test mode</span>
        {status?.paused ? <span role="status" {...stylex.props(styles.mode)}><span aria-hidden="true" {...stylex.props(styles.modeDot)} />Paused</span> : null}
        <Link to="/" {...stylex.props(styles.back)}>Back to site</Link>
      </div>
    </>
  )
}
