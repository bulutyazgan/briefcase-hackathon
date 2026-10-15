import { useState, useSyncExternalStore } from 'react'
import * as stylex from '@stylexjs/stylex'
import { getSnapshot, refreshState, subscribe } from './app-state'
import { Audit } from './features/audit/view'
import { Books } from './features/books/view'
import { Control } from './features/control/view'
import { Inbox } from './features/inbox/view'
import { Invoices } from './features/invoices/view'
import { styles } from './app.stylex'

export function App() {
  const { state, error } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')

  const invoiceCount = state?.invoices.length ?? 0
  const pendingCount = state?.approvals.filter((approval) => approval.status === 'pending').length ?? 0

  return (
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.shell)}>
        <header {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.brand)}>
            <span aria-hidden="true" {...stylex.props(styles.mark)}>T</span>
            <div>
              <p {...stylex.props(styles.wordmark)}>Tally</p>
              <p {...stylex.props(styles.tagline)}>Revenue, accounted for.</p>
            </div>
          </div>
          <div {...stylex.props(styles.badge)}>Stripe test mode · protected</div>
        </header>
        <h1 {...stylex.props(styles.heading)}>Client work, captured.</h1>
        <p {...stylex.props(styles.intro)}>
          Tally turns clear commitments into policy-checked invoices, with the evidence in view.
        </p>
        {error && <p role="alert" {...stylex.props(styles.error)}>{error} Trying again automatically.</p>}
        {state
          ? (
            <>
              <div {...stylex.props(styles.notice)}>
                {invoiceCount} invoices · {pendingCount} approvals waiting · Simulator and Slack share one audit ledger
              </div>
              <div {...stylex.props(styles.columns)}>
                <Inbox state={state} onRefresh={() => void refreshState()} />
                <div {...stylex.props(styles.right)}>
                  <Control />
                  <Invoices
                    state={state}
                    selectedInvoiceId={selectedInvoiceId}
                    onSelect={setSelectedInvoiceId}
                  />
                  <Books />
                  <Audit events={state.events} />
                </div>
              </div>
            </>
          )
          : <p {...stylex.props(styles.loading)}>Connecting to Tally…</p>}
        <footer {...stylex.props(styles.footer)}>
          <span>Policy decisions are made by code, not the language model.</span>
          <span>All amounts are in GBP.</span>
        </footer>
      </div>
    </main>
  )
}
