import * as stylex from '@stylexjs/stylex'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { AppState, SourcedLead } from './api'
import { getSnapshot, refreshState, setReadOnlyMode, subscribe } from './app-state'
import { AppShell } from './components/layout/app-shell'
import { Button } from './components/ui/button'
import { content } from './components/ui/content.stylex'
import { Opening, Page, Section } from './components/ui/page'
import { SkeletonBar, SkeletonSwap } from './components/ui/skeleton'
import { StatStrip } from './components/ui/stat-strip'
import { Text } from './components/ui/text'
import { Audit } from './features/audit/view'
import { Books } from './features/books/view'
import { Inbox } from './features/inbox/view'
import { InvoiceDetail, Invoices } from './features/invoices/view'
import { Opportunities } from './features/opportunities/view'
import { Policy } from './features/policy/view'
import { Leads } from './features/leads/view'
import { Notifications, notificationsOf } from './features/notifications/view'
import { Company } from './features/company/view'
import { motion } from './motion.stylex'
import { useControlStatus } from './features/control/use-control-status'
import { navigate, usePath } from './router'

type Route =
  | { page: 'inbox' }
  | { page: 'invoices' }
  | { page: 'leads' }
  | { page: 'invoice-detail'; invoiceId: string }
  | { page: 'opportunities' }
  | { page: 'books' }
  | { page: 'audit' }
  | { page: 'policy' }
  | { page: 'notifications' }
  | { page: 'company' }
  | { page: 'not-found' }

function resolveRoute(path: string): Route {
  if (path === '/app/inbox') return { page: 'inbox' }
  if (path === '/app/invoices') return { page: 'invoices' }
  if (path === '/app/leads') return { page: 'leads' }
  if (path === '/app/opportunities') return { page: 'opportunities' }
  if (path === '/app/books') return { page: 'books' }
  if (path === '/app/audit') return { page: 'audit' }
  if (path === '/app/policy') return { page: 'policy' }
  if (path === '/app/notifications') return { page: 'notifications' }
  if (path === '/app/company') return { page: 'company' }
  const match = path.match(/^\/app\/invoices\/([^/]+)$/)
  if (match) {
    try {
      return { page: 'invoice-detail', invoiceId: decodeURIComponent(match[1]) }
    } catch {
      return { page: 'not-found' }
    }
  }
  return { page: 'not-found' }
}

// Nav order; a page slides in from the side it sits on relative to the one it replaces.
const pageOrder = ['inbox', 'invoices', 'leads', 'opportunities', 'books', 'audit', 'policy'] as const

function pageIndex(route: Route): number {
  const page = route.page === 'invoice-detail' ? 'invoices' : route.page
  return pageOrder.findIndex((candidate) => candidate === page)
}

interface PageTransition {
  index: number
  direction: -1 | 0 | 1
  key: number
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return <div {...stylex.props(content.stack)}>{Array.from({ length: count }, (_, index) => <SkeletonBar key={index} width={index % 2 ? 'md' : 'full'} height="text" />)}</div>
}

function Placeholder({ error, shape = 'list' }: { error: boolean; shape?: 'list' | 'thread' | 'pdf' }) {
  const skeletonShape = shape === 'pdf' ? content.pdfPlaceholder : shape === 'thread' ? content.threadPlaceholder : content.listPlaceholder
  const errorShape = shape === 'pdf' ? content.pdfErrorPanel : shape === 'thread' ? content.threadErrorPanel : content.listErrorPanel
  return error
    ? <div aria-hidden="true" {...stylex.props(content.errorPanel, errorShape)} />
    : <div {...stylex.props(content.card, content.stack, skeletonShape)}><SkeletonRows count={4} /></div>
}

function PageSkeleton({ route, error, onRetry }: { route: Route; error: boolean; onRetry: () => void }) {
  const title: ReactNode = error ? route.page === 'leads' ? 'We could not load the leads' : 'We could not load the ledger' : <SkeletonBar width="lg" height="control" />
  const lede: ReactNode = error ? route.page === 'leads' ? 'The leads list did not respond; retry now or wait for the next update.' : 'The ledger did not respond; retry now or wait for the next update.' : <SkeletonBar width="md" />
  const tools = error ? <Button variant="primary" onClick={onRetry}>Retry</Button> : <SkeletonBar width="sm" height="control" />
  if (route.page === 'leads') return <Page>
    <Opening title={title} lede={lede} tools={tools} />
    <StatStrip items={[{ label: 'Leads', value: error ? '—' : <SkeletonBar width="sm" /> }, { label: 'Delivered', value: error ? '—' : <SkeletonBar width="sm" /> }, { label: 'Awaiting payment', value: error ? '—' : <SkeletonBar width="sm" /> }]} />
    <Section title="Lead directory" description={error ? undefined : 'Search sourced prospects and their invoices'}><Placeholder error={error} /></Section>
  </Page>
  return (
    <Page>
      <Opening title={title} lede={lede} tools={tools} />
      <StatStrip items={[
        { label: 'Messages', value: error ? '—' : <SkeletonBar width="sm" /> },
        { label: 'Invoices', value: error ? '—' : <SkeletonBar width="sm" /> },
        { label: 'Activity', value: error ? '—' : <SkeletonBar width="sm" /> },
      ]} />
      {route.page === 'inbox' ? <div {...stylex.props(content.twoCol)}>
        <Section title="Client channel" description={error ? undefined : 'Simulator thread and agent responses'}><Placeholder error={error} shape="thread" /></Section>
        <Section title="Pending approvals" description={error ? undefined : 'Review before billing'}><Placeholder error={error} /></Section>
      </div> : route.page === 'invoice-detail' ? <div {...stylex.props(content.twoCol)}>
        <Section title="Invoice PDF" description={error ? undefined : 'Invoice and evidence appendix'}><Placeholder error={error} shape="pdf" /></Section>
        <Section title="Evidence trail" description={error ? undefined : 'The agreement behind the amount'}><Placeholder error={error} /></Section>
      </div> : <Section title={route.page === 'audit' ? 'Audit trail' : 'Invoices'} description={error ? undefined : 'Recent activity and records'}><Placeholder error={error} /></Section>}
    </Page>
  )
}

function NotFound() {
  return <Page><Opening title="This page is not available" lede="Choose a page from the sidebar to continue." /></Page>
}

function RouteContent({ route, state, leads, onRefresh, readOnly }: { route: Route; state: AppState; leads: SourcedLead[]; onRefresh: () => void; readOnly: boolean }) {
  if (route.page === 'inbox') return <Inbox state={state} onRefresh={onRefresh} readOnly={readOnly} />
  if (route.page === 'invoices') return <Invoices state={state} />
  if (route.page === 'leads') return <Leads state={state} leads={leads} />
  if (route.page === 'invoice-detail') return <InvoiceDetail state={state} invoiceId={route.invoiceId} onRefresh={onRefresh} readOnly={readOnly} />
  if (route.page === 'audit') return <Audit state={state} />
  if (route.page === 'notifications') return <Notifications state={state} />
  if (route.page === 'company') return <Company readOnly={readOnly} />
  return <Policy state={state} />
}

// Pages that fetch their own data, or none, render without waiting for the ledger snapshot.
function StandalonePage({ route, state }: { route: Route; state: AppState | null }) {
  if (route.page === 'books') return <Books />
  if (route.page === 'opportunities') return <Opportunities />
  if (route.page === 'policy') return <Policy state={state ?? undefined} />
  return <NotFound />
}

export function App() {
  const path = usePath()
  const control = useControlStatus()
  const { state, leads, error, leadsError } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const route = resolveRoute(path)
  const index = pageIndex(route)
  const [transition, setTransition] = useState<PageTransition>({ index, direction: 0, key: 0 })
  if (transition.index !== index) {
    setTransition({
      index,
      direction: index < 0 || transition.index < 0 ? 0 : index > transition.index ? 1 : -1,
      key: transition.key + 1,
    })
  }
  useEffect(() => {
    if (control.loaded) setReadOnlyMode(control.status?.readOnly ?? false)
  }, [control.loaded, control.status?.readOnly])
  if (path === '/app') {
    navigate('/app/inbox')
    return null
  }
  const invoiceCount = state?.invoices.length ?? 0
  const pendingCount = state?.approvals.filter((approval) => approval.status === 'pending').length ?? 0
  const standalone = route.page === 'policy' || route.page === 'books' || route.page === 'opportunities' || route.page === 'not-found'
  const needsState = !standalone
  const routeError = route.page === 'leads' ? leadsError : error
  const loading = needsState && (!state || (route.page === 'leads' && !leads)) && !routeError && !error
  const readOnly = control.status?.readOnly ?? false
  const contentToRender = standalone
    ? <StandalonePage route={route} state={state} />
    : routeError || error
      ? <PageSkeleton route={route} error onRetry={() => void refreshState()} />
      : state
        ? <RouteContent route={route} state={state} leads={leads ?? []} onRefresh={() => void refreshState()} readOnly={readOnly} />
        : <PageSkeleton route={route} error={false} onRetry={() => void refreshState()} />

  return <AppShell path={path} invoiceCount={invoiceCount} pendingCount={pendingCount} leadsCount={leads?.length ?? 0} notificationCount={state ? notificationsOf(state).length : 0} readOnly={readOnly}>
    <SkeletonSwap loading={loading} skeleton={<PageSkeleton route={route} error={false} onRetry={() => void refreshState()} />}>
      <div key={transition.key} {...stylex.props(transition.direction > 0 && motion.pageForward, transition.direction < 0 && motion.pageBack)}>
        {contentToRender}
      </div>
    </SkeletonSwap>
  </AppShell>
}
