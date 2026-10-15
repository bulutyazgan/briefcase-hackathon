import * as stylex from '@stylexjs/stylex'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { AppState } from './api'
import { getSnapshot, refreshState, subscribe } from './app-state'
import { AppShell } from './components/layout/app-shell'
import { Button } from './components/ui/button'
import { content } from './components/ui/content.stylex'
import { Opening, Page, Section } from './components/ui/page'
import { SkeletonBar, SkeletonSwap } from './components/ui/skeleton'
import { StatStrip } from './components/ui/stat-strip'
import { Text } from './components/ui/text'
import { Audit } from './features/audit/view'
import { Inbox } from './features/inbox/view'
import { InvoiceDetail, Invoices } from './features/invoices/view'
import { Policy } from './features/policy/view'
import { navigate, usePath } from './router'

type Route =
  | { page: 'inbox' }
  | { page: 'invoices' }
  | { page: 'invoice-detail'; invoiceId: string }
  | { page: 'audit' }
  | { page: 'policy' }
  | { page: 'not-found' }

function resolveRoute(path: string): Route {
  if (path === '/app/inbox') return { page: 'inbox' }
  if (path === '/app/invoices') return { page: 'invoices' }
  if (path === '/app/audit') return { page: 'audit' }
  if (path === '/app/policy') return { page: 'policy' }
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
  const title: ReactNode = error ? 'We could not load the ledger' : <SkeletonBar width="lg" height="control" />
  const lede: ReactNode = error ? 'The ledger did not respond; retry now or wait for the next update.' : <SkeletonBar width="md" />
  const tools = error ? <Button variant="primary" onClick={onRetry}>Retry</Button> : <SkeletonBar width="sm" height="control" />
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

function RouteContent({ route, state, onRefresh }: { route: Route; state: AppState; onRefresh: () => void }) {
  if (route.page === 'inbox') return <Inbox state={state} onRefresh={onRefresh} />
  if (route.page === 'invoices') return <Invoices state={state} />
  if (route.page === 'invoice-detail') return <InvoiceDetail state={state} invoiceId={route.invoiceId} onRefresh={onRefresh} />
  if (route.page === 'audit') return <Audit state={state} />
  return <Policy />
}

export function App() {
  const path = usePath()
  const { state, error } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  if (path === '/app') {
    navigate('/app/inbox')
    return null
  }
  const route = resolveRoute(path)
  const invoiceCount = state?.invoices.length ?? 0
  const pendingCount = state?.approvals.filter((approval) => approval.status === 'pending').length ?? 0
  const needsState = route.page !== 'policy' && route.page !== 'not-found'
  const loading = needsState && !state && !error
  const contentToRender = route.page === 'not-found'
    ? <NotFound />
    : route.page === 'policy'
      ? <Policy />
      : error
        ? <PageSkeleton route={route} error onRetry={() => void refreshState()} />
        : state
        ? <RouteContent route={route} state={state} onRefresh={() => void refreshState()} />
        : <PageSkeleton route={route} error={false} onRetry={() => void refreshState()} />

  return <AppShell path={path} invoiceCount={invoiceCount} pendingCount={pendingCount}>
    <SkeletonSwap loading={loading} skeleton={<PageSkeleton route={route} error={false} onRetry={() => void refreshState()} />}>
      {contentToRender}
    </SkeletonSwap>
  </AppShell>
}
