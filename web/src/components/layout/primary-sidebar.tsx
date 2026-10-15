import * as stylex from '@stylexjs/stylex'
import { HugeiconsIcon } from '@hugeicons/react'
import { Activity01Icon, Building03Icon, InboxIcon, Invoice01Icon, Notification01Icon, Shield01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { space } from '../../tokens/tokens.stylex'
import { content } from '../ui/content.stylex'
import { TallyLogo } from '../ui/tally-logo'
import { Link } from '../../router'
import { styles } from './app-shell.stylex'

const items = [
  { label: 'Inbox', path: '/app/inbox', icon: InboxIcon, key: 'inbox' },
  { label: 'Notifications', path: '/app/notifications', icon: Notification01Icon, key: 'notifications' },
  { label: 'Company', path: '/app/company', icon: Building03Icon, key: 'company' },
  { label: 'Invoices', path: '/app/invoices', icon: Invoice01Icon, key: 'invoices' },
  { label: 'Leads', path: '/app/leads', icon: UserGroupIcon, key: 'leads' },
  { label: 'Audit', path: '/app/audit', icon: Activity01Icon, key: 'audit' },
  { label: 'Policy', path: '/app/policy', icon: Shield01Icon, key: 'policy' },
] as const

const iconStyles = stylex.create({
  pair: { alignItems: 'center', display: 'inline-flex', gap: space.sm, lineHeight: 'inherit' },
  icon: { flexShrink: 0 },
  brandHeader: { alignItems: 'flex-start', display: 'flex', flexDirection: 'column', gap: space.xs, minWidth: 0 },
  readOnly: { lineHeight: '16px', maxWidth: '100%', whiteSpace: 'normal' },
})

export function PrimarySidebar({ path, invoiceCount, pendingCount, leadsCount, notificationCount, readOnly }: { path: string; invoiceCount: number; pendingCount: number; leadsCount: number; notificationCount: number; readOnly: boolean }) {
  const active = path.startsWith('/app/invoices') ? 'invoices' : path.split('/')[2]
  return (
    <>
      <div {...stylex.props(iconStyles.brandHeader)}>
        <Link to="/app/inbox" {...stylex.props(styles.brand)}><TallyLogo size={20} />Tally</Link>
        {readOnly ? <span role="status" {...stylex.props(content.tag, iconStyles.readOnly)}>Read-only demo · recorded run</span> : null}
      </div>
      <nav aria-label="Main navigation" {...stylex.props(styles.nav)}>
        {items.map((item) => {
          const count = item.key === 'inbox' ? pendingCount : item.key === 'invoices' ? invoiceCount : item.key === 'leads' ? leadsCount : item.key === 'notifications' ? notificationCount : undefined
          return <Link key={item.key} to={item.path} aria-current={active === item.key ? 'page' : undefined} {...stylex.props(styles.navLink, active === item.key && styles.active)}><span {...stylex.props(iconStyles.pair)}><HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.5} aria-hidden="true" {...stylex.props(iconStyles.icon)} />{item.label}</span>{count !== undefined ? <span {...stylex.props(styles.badge)} aria-label={`${count} ${item.key === 'inbox' ? 'pending approvals' : item.key === 'invoices' ? 'invoices' : item.key === 'notifications' ? 'notifications' : 'leads'}`}>{count}</span> : null}</Link>
        })}
      </nav>
      <div {...stylex.props(styles.footer)}><span {...stylex.props(styles.mode)}><span aria-hidden="true" {...stylex.props(styles.modeDot)} />Stripe test mode</span><Link to="/" {...stylex.props(styles.back)}>Back to site</Link></div>
    </>
  )
}
