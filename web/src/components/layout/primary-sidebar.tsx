import * as stylex from '@stylexjs/stylex'
import { HugeiconsIcon } from '@hugeicons/react'
import { Activity01Icon, BookOpen01Icon, InboxIcon, Invoice01Icon, Shield01Icon, SparklesIcon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { useControlStatus } from '../../features/control/use-control-status'
import { space } from '../../tokens/tokens.stylex'
import { TallyLogo } from '../ui/tally-logo'
import { Link } from '../../router'
import { styles } from './app-shell.stylex'

const items = [
  { label: 'Inbox', path: '/app/inbox', icon: InboxIcon, key: 'inbox' },
  { label: 'Invoices', path: '/app/invoices', icon: Invoice01Icon, key: 'invoices' },
  { label: 'Leads', path: '/app/leads', icon: UserGroupIcon, key: 'leads' },
  { label: 'Opportunities', path: '/app/opportunities', icon: SparklesIcon, key: 'opportunities' },
  { label: 'Books', path: '/app/books', icon: BookOpen01Icon, key: 'books' },
  { label: 'Audit', path: '/app/audit', icon: Activity01Icon, key: 'audit' },
  { label: 'Policy', path: '/app/policy', icon: Shield01Icon, key: 'policy' },
] as const

const iconStyles = stylex.create({
  pair: { alignItems: 'center', display: 'inline-flex', gap: space.sm, lineHeight: 'inherit' },
  icon: { flexShrink: 0 },
})

export function PrimarySidebar({ path, invoiceCount, pendingCount, leadsCount }: { path: string; invoiceCount: number; pendingCount: number; leadsCount: number }) {
  const active = path.startsWith('/app/invoices') ? 'invoices' : path.split('/')[2]
  const { status } = useControlStatus()
  return (
    <>
      <Link to="/app/inbox" {...stylex.props(styles.brand)}><TallyLogo size={20} />Tally</Link>
      <nav aria-label="Main navigation" {...stylex.props(styles.nav)}>
        {items.map((item) => {
          const count = item.key === 'inbox' ? pendingCount : item.key === 'invoices' ? invoiceCount : item.key === 'leads' ? leadsCount : undefined
          return <Link key={item.key} to={item.path} aria-current={active === item.key ? 'page' : undefined} {...stylex.props(styles.navLink, active === item.key && styles.active)}><span {...stylex.props(iconStyles.pair)}><HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.5} aria-hidden="true" {...stylex.props(iconStyles.icon)} />{item.label}</span>{count !== undefined ? <span {...stylex.props(styles.badge)} aria-label={`${count} ${item.key === 'inbox' ? 'pending approvals' : item.key === 'invoices' ? 'invoices' : 'leads'}`}>{count}</span> : null}</Link>
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
