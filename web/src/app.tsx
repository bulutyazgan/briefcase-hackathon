import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { getSnapshot, refreshState, subscribe } from './app-state'
import { Audit } from './features/audit/view'
import { Books } from './features/books/view'
import { Control } from './features/control/view'
import { useControlStatus } from './features/control/use-control-status'
import { startBuyerAgent } from './features/inbox/api'
import { Inbox, PendingApprovals } from './features/inbox/view'
import { Invoices } from './features/invoices/view'
import { Policy } from './features/policy/view'
import { Link, navigate, usePath } from './router'
import { styles } from './app.stylex'

type Route =
  | { page: 'inbox' }
  | { page: 'invoices' }
  | { page: 'invoice-detail'; invoiceId: string }
  | { page: 'audit' }
  | { page: 'books' }
  | { page: 'policy' }
  | { page: 'not-found' }

function resolveRoute(path: string): Route {
  if (path === '/app/inbox') return { page: 'inbox' }
  if (path === '/app/invoices') return { page: 'invoices' }
  if (path === '/app/audit') return { page: 'audit' }
  if (path === '/app/books') return { page: 'books' }
  if (path === '/app/policy') return { page: 'policy' }
  const invoiceMatch = path.match(/^\/app\/invoices\/([^/]+)$/)
  if (invoiceMatch) {
    try {
      return { page: 'invoice-detail', invoiceId: decodeURIComponent(invoiceMatch[1]) }
    } catch {
      return { page: 'not-found' }
    }
  }
  return { page: 'not-found' }
}

function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle: string
  actions: ReactNode
}) {
  return (
    <header {...stylex.props(styles.pageHeader)}>
      <div>
        <h1 {...stylex.props(styles.heading)}>{title}</h1>
        <p {...stylex.props(styles.subtitle)}>{subtitle}</p>
      </div>
      <div {...stylex.props(styles.actions)}>{actions}</div>
    </header>
  )
}

function ShellNavigation({
  path,
  invoiceCount,
  pendingCount,
}: {
  path: string
  invoiceCount: number
  pendingCount: number
}) {
  const currentPage = path === '/app/invoices' || path.startsWith('/app/invoices/')
    ? 'invoices'
    : path.split('/')[2]
  const items: { label: string; to: string; key: string; count?: number }[] = [
    { label: 'Inbox', to: '/app/inbox', key: 'inbox', count: pendingCount },
    { label: 'Invoices', to: '/app/invoices', key: 'invoices', count: invoiceCount },
    { label: 'Audit', to: '/app/audit', key: 'audit' },
    { label: 'Books', to: '/app/books', key: 'books' },
    { label: 'Policy', to: '/app/policy', key: 'policy' },
  ]

  return (
    <nav {...stylex.props(styles.nav)} aria-label="Main navigation">
      {items.map((item) => {
        const active = item.key === currentPage
        return (
          <Link
            key={item.key}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            {...stylex.props(styles.navLink, active && styles.activeNavLink)}
          >
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                {...stylex.props(styles.count, active && styles.activeCount)}
                aria-label={`${item.count} ${item.label === 'Inbox' ? 'pending approvals' : 'invoices'}`}
              >
                {item.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

const buyerAgentLabel = {
  idle: 'Start buyer agent',
  busy: 'Starting buyer agent…',
  started: 'Buyer agent running',
  failed: 'Buyer agent did not start',
} as const

type BuyerAgentPhase = keyof typeof buyerAgentLabel

function StartBuyerAgentButton() {
  const [phase, setPhase] = useState<BuyerAgentPhase>('idle')
  const [detail, setDetail] = useState('')

  async function start(): Promise<void> {
    setPhase('busy')
    setDetail('')
    try {
      await startBuyerAgent()
      setPhase('started')
      void refreshState()
    } catch (reason) {
      setPhase('failed')
      setDetail(String(reason))
    }
  }

  return (
    <button
      type="button"
      {...stylex.props(styles.secondaryPill)}
      disabled={phase === 'busy' || phase === 'started'}
      title={detail || undefined}
      onClick={() => void start()}
    >
      {buyerAgentLabel[phase]}
    </button>
  )
}

function LoadingState() {
  return (
    <div {...stylex.props(styles.state)} role="status" aria-live="polite">
      <p {...stylex.props(styles.stateTitle)}>Loading dashboard</p>
      <p {...stylex.props(styles.stateMessage)}>Connecting to the invoice ledger…</p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div {...stylex.props(styles.state)} role="alert">
      <p {...stylex.props(styles.stateTitle)}>Dashboard unavailable</p>
      <p {...stylex.props(styles.stateMessage, styles.stateError)}>{message}</p>
      <button type="button" {...stylex.props(styles.primaryPill)} onClick={() => void refreshState()}>
        Try again
      </button>
    </div>
  )
}

export function App() {
  const path = usePath()
  const { state, error } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const control = useControlStatus()
  const route = resolveRoute(path)
  const invoiceCount = state?.invoices.length ?? 0
  const pendingCount = state?.approvals.filter((approval) => approval.status === 'pending').length ?? 0

  useEffect(() => {
    if (path === '/app') navigate('/app/inbox')
  }, [path])

  if (path === '/app') return null

  let title = 'Page not found'
  let subtitle = 'That dashboard page is not available.'
  let actions: ReactNode = <Link to="/app/inbox" {...stylex.props(styles.primaryPill)}>Go to inbox</Link>

  if (route.page === 'inbox') {
    title = 'Inbox'
    subtitle = 'Review client commitments and pending approvals.'
    actions = (
      <>
        <button
          type="button"
          {...stylex.props(styles.primaryPill)}
          onClick={() => document.getElementById('message-text')?.focus()}
        >
          New message
        </button>
        <StartBuyerAgentButton />
        <Link to="/app/audit" {...stylex.props(styles.secondaryPill)}>View audit</Link>
      </>
    )
  } else if (route.page === 'invoices') {
    title = 'Invoices'
    subtitle = 'Every amount is policy checked and backed by evidence.'
    actions = (
      <>
        <Link to="/app/inbox" {...stylex.props(styles.primaryPill)}>New invoice request</Link>
        <Link to="/app/audit" {...stylex.props(styles.secondaryPill)}>View audit</Link>
      </>
    )
  } else if (route.page === 'invoice-detail') {
    title = 'Invoice detail'
    subtitle = `Invoice ${route.invoiceId} and its supporting evidence.`
    const invoice = state?.invoices.find((item) => item.id === route.invoiceId)
    actions = (
      <>
        {invoice?.hosted_url && (
          <a href={invoice.hosted_url} target="_blank" rel="noreferrer" {...stylex.props(styles.primaryPill)}>
            Open Stripe invoice
          </a>
        )}
        <Link to="/app/invoices" {...stylex.props(styles.secondaryPill)}>All invoices</Link>
      </>
    )
  } else if (route.page === 'audit') {
    title = 'Audit'
    subtitle = 'A trace of the decisions, evidence, and invoice events.'
    actions = (
      <>
        <button type="button" {...stylex.props(styles.primaryPill)} onClick={() => void refreshState()}>
          Refresh
        </button>
        <Link to="/app/policy" {...stylex.props(styles.secondaryPill)}>View policy</Link>
      </>
    )
  } else if (route.page === 'books') {
    title = 'Books'
    subtitle = 'Double-entry journals, VAT and margin for every finalised invoice.'
    actions = <Link to="/app/invoices" {...stylex.props(styles.secondaryPill)}>View invoices</Link>
  } else if (route.page === 'policy') {
    title = 'Billing policy'
    subtitle = 'The rules Tally applies before it prepares an invoice.'
    actions = <Link to="/app/inbox" {...stylex.props(styles.secondaryPill)}>Back to inbox</Link>
  }

  return (
    <main {...stylex.props(styles.page)}>
      <aside {...stylex.props(styles.rail)} aria-label="Tally app navigation">
        <div {...stylex.props(styles.brand)}>
          <span aria-hidden="true" {...stylex.props(styles.brandDot)} />
          <span {...stylex.props(styles.wordmark)}>tally</span>
        </div>
        <ShellNavigation path={path} invoiceCount={invoiceCount} pendingCount={pendingCount} />
        <div {...stylex.props(styles.railFooter)}>
          <div {...stylex.props(styles.railPills)}>
            <span {...stylex.props(styles.modePill)}>Stripe test mode</span>
            {control.status?.paused && (
              <span role="status" {...stylex.props(styles.modePill, styles.pausedPill)}>Paused</span>
            )}
          </div>
          <Link to="/" {...stylex.props(styles.backLink)}>Back to site</Link>
        </div>
      </aside>
      <section {...stylex.props(styles.content)} aria-label={`${title} page`}>
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        <div {...stylex.props(styles.pageBody)}>
          {error && state && <p role="alert">{error} Trying again automatically.</p>}
          {error && !state
            ? <ErrorState message={error} />
            : !state
              ? <LoadingState />
              : route.page === 'inbox'
                ? (
                  <div {...stylex.props(styles.inboxGrid)}>
                    <Inbox state={state} onRefresh={() => void refreshState()} />
                    <PendingApprovals state={state} onRefresh={() => void refreshState()} />
                  </div>
                )
                : route.page === 'invoices'
                  ? (
                    <Invoices
                      state={state}
                      mode="list"
                      onSelect={(invoiceId) => navigate(`/app/invoices/${encodeURIComponent(invoiceId)}`)}
                    />
                  )
                  : route.page === 'invoice-detail'
                    ? (
                      <Invoices
                        state={state}
                        mode="detail"
                        selectedInvoiceId={route.invoiceId}
                        onSelect={(invoiceId) => navigate(`/app/invoices/${encodeURIComponent(invoiceId)}`)}
                      />
                    )
                    : route.page === 'audit'
                      ? <Audit events={state.events} />
                      : route.page === 'books'
                        ? <Books />
                      : route.page === 'policy'
                        ? (
                          <div {...stylex.props(styles.policyStack)}>
                            <Policy />
                            <Control />
                          </div>
                        )
                        : (
                          <div {...stylex.props(styles.state)} role="status">
                            <p {...stylex.props(styles.stateTitle)}>Page not found</p>
                            <p {...stylex.props(styles.stateMessage)}>Choose a page from the navigation to continue.</p>
                          </div>
                        )}
        </div>
      </section>
    </main>
  )
}
