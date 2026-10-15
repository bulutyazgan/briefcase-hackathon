import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { HugeiconsIcon } from '@hugeicons/react'
import { SentIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import type { AppState, ApprovalRow, ChannelMessage } from '../../api'
import { Button } from '../../components/ui/button'
import { InlineCitations } from '../../components/ui/inline-citations'
import { Page, Opening, Section } from '../../components/ui/page'
import { RowList, RowListItem } from '../../components/ui/row-list'
import { StatStrip } from '../../components/ui/stat-strip'
import { Text } from '../../components/ui/text'
import { TextResponse } from '../../components/ui/text-response'
import { ThinkingReasoning } from '../../components/ui/thinking-reasoning'
import { ThinkingState } from '../../components/ui/thinking-state'
import { content } from '../../components/ui/content.stylex'
import { formatMoneyText } from '../../format'
import { motion } from '../../motion.stylex'
import { prefersReducedMotion, useFreshIds } from '../../motion'
import { Link } from '../../router'
import { evidenceFromEvent } from '../invoices/api'
import { decideApproval, sendMessage, startBuyerAgent } from './api'

const authors = ['Client — Northwind', 'Client — Acme', 'Client — Globex', 'Account owner', 'Unknown sender'] as const

type BuyerState = 'idle' | 'busy' | 'started' | 'failed'

const buyerLabel: Record<BuyerState, string> = {
  idle: 'Start buyer agent',
  busy: 'Starting buyer agent',
  started: 'Buyer agent started',
  failed: 'Buyer agent failed · retry',
}

function money(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

function reasonAmount(reason: string): number {
  const match = reason.match(/£\s*([\d,]+(?:\.\d{1,2})?)/)
  return match ? Math.round(Number.parseFloat(match[1].replaceAll(',', '')) * 100) : 0
}

function isTally(message: ChannelMessage): boolean {
  return message.author.toLowerCase() === 'tally'
}

function messageEvents(state: AppState, message: ChannelMessage) {
  return state.events
    .filter((event) => event.message_id === message.id || event.message_id === message.thread)
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
}

function stepName(step: string): string | null {
  if (step === 'extract') return 'extract'
  if (step === 'recall') return 'recall'
  if (step === 'size' || step === 'leads' || step === 'lead_sizing' || step === 'source_leads') return 'source leads'
  if (step === 'price') return 'price'
  if (step === 'decide' || step === 'policy') return 'policy'
  if (step === 'billing' || step === 'bill') return 'bill'
  return null
}

function AgentReasoning({ state, message }: { state: AppState; message: ChannelMessage }) {
  const events = messageEvents(state, message)
  const order = ['extract', 'recall', 'source leads', 'price', 'policy', 'bill']
  const steps = order.flatMap((name) => {
    const matches = events.filter((event) => stepName(event.step) === name)
    return matches.length ? [{ name, detail: formatMoneyText(matches.map((event) => event.summary).join(' · ')) }] : []
  })
  if (!steps.length) return null
  const start = Date.parse(events[0].created_at)
  const end = Date.parse(events[events.length - 1].created_at)
  return <ThinkingReasoning seconds={Math.max(1, Math.round((end - start) / 1000))} steps={steps} />
}

function AgentCitations({ state, message }: { state: AppState; message: ChannelMessage }) {
  const invoice = state.invoices.find((item) => item.message_id === message.thread || item.message_id === message.id)
  if (!invoice) return null
  const evidenceEvent = state.events.find((item) => item.message_id === invoice.message_id && evidenceFromEvent(item).length > 0)
  const evidence = evidenceFromEvent(evidenceEvent)[0]
  if (!evidence) return null
  const path = `/app/invoices/${encodeURIComponent(invoice.id)}`
  return <InlineCitations citations={[
    { label: `invoice amount ${money(invoice.total_pence)}`, href: `${path}#invoice-amount` },
    { label: 'client quote', href: `${path}#evidence-quote` },
    { label: 'memory fact', href: `${path}#evidence-memory` },
    ...evidence.clauses.map((clause) => ({ label: `policy ${clause}`, href: `${path}#policy-${clause}` })),
  ]} />
}

function MessageBubble({ state, message, freshIndex }: { state: AppState; message: ChannelMessage; freshIndex: number | undefined }) {
  const tally = isTally(message)
  const text = formatMoneyText(message.text)
  return (
    <article
      {...stylex.props(
        content.message,
        tally ? content.agentMessage : content.clientMessage,
        freshIndex !== undefined && (tally ? motion.enterUpHighlighted : motion.enterUp),
        freshIndex !== undefined && motion.stagger(freshIndex),
      )}
    >
      <div {...stylex.props(content.messageTop)}>
        <Text role="label">{message.author}</Text>
        <span {...stylex.props(content.timestamp)}>{new Date(message.ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>
      {tally
        ? <><TextResponse>{text}</TextResponse><AgentCitations state={state} message={message} /><AgentReasoning state={state} message={message} /></>
        : <Text role="compact">{text}</Text>}
    </article>
  )
}

function ApprovalItem({ approval, busy, leaving, onDecide }: { approval: ApprovalRow; busy: boolean; leaving: boolean; onDecide: (id: string, action: 'approve' | 'reject') => void }) {
  return (
    <div role="presentation" {...stylex.props(motion.collapsible, leaving && motion.collapsed)} aria-hidden={leaving || undefined}>
      <RowListItem id={approval.id}>
        <div {...stylex.props(content.stack, content.full, motion.enterScale)}>
          <div {...stylex.props(content.row)}><Text role="heading16">Approval needed</Text><span {...stylex.props(content.id)}>{approval.message_id.slice(0, 8)}</span></div>
          <Text role="compact">{formatMoneyText(approval.reason)}</Text>
          <div {...stylex.props(content.approvalActions)}>
            <Button variant="primary" disabled={busy} onClick={() => onDecide(approval.message_id, 'approve')}><span {...stylex.props(content.iconLabel)}><HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={1.5} aria-hidden="true" {...stylex.props(content.icon)} />Approve invoice</span></Button>
            <Button disabled={busy} onClick={() => onDecide(approval.message_id, 'reject')}>Reject</Button>
          </div>
        </div>
      </RowListItem>
    </div>
  )
}

export function Inbox({ state, onRefresh }: { state: AppState; onRefresh: () => void }) {
  const [author, setAuthor] = useState<string>(authors[0])
  const [messageText, setMessageText] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyApproval, setBusyApproval] = useState('')
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set())
  const [buyer, setBuyer] = useState<BuyerState>('idle')
  const [error, setError] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const pending = state.approvals.filter((approval) => approval.status === 'pending')
  const thread = state.messages.slice(-40)
  const fresh = useFreshIds('feed', thread.map((message) => message.id))
  const newestId = thread[thread.length - 1]?.id
  const outstanding = state.invoices.filter((invoice) => invoice.status !== 'paid').reduce((total, invoice) => total + invoice.total_pence, 0)
  const pendingAmount = pending.map((approval) => reasonAmount(approval.reason)).find((amount) => amount > 0) || outstanding
  const title = pending.length
    ? pendingAmount > 0 ? `${money(pendingAmount)} awaiting your approval` : `${pending.length} approval${pending.length === 1 ? '' : 's'} waiting for review`
    : state.invoices.length ? `${state.invoices.length} invoice${state.invoices.length === 1 ? '' : 's'} in the ledger` : 'Your client commitments are in one place'

  // Follow the conversation: when a reply lands, bring it into view.
  useEffect(() => {
    const feed = threadRef.current
    if (!feed || newestId === undefined) return
    feed.scrollTo({ top: feed.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [newestId])

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!messageText.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await sendMessage(author, messageText.trim())
      setMessageText('')
      onRefresh()
    } catch (sendError) {
      setError(String(sendError))
    } finally {
      setBusy(false)
    }
  }

  async function decide(id: string, action: 'approve' | 'reject'): Promise<void> {
    setBusyApproval(id)
    setError('')
    setDecided((current) => new Set(current).add(id))
    try {
      await decideApproval(id, action)
      onRefresh()
    } catch (decisionError) {
      setError(String(decisionError))
      setDecided((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    } finally {
      setBusyApproval('')
    }
  }

  async function startBuyer(): Promise<void> {
    if (buyer === 'busy') return
    setBuyer('busy')
    try {
      await startBuyerAgent()
      setBuyer('started')
      onRefresh()
    } catch {
      setBuyer('failed')
    }
  }

  return (
    <Page>
      <Opening
        title={title}
        lede="Commitments, approvals and billing evidence stay together."
        tools={<>
          <Button variant="secondary" disabled={buyer === 'busy'} aria-busy={buyer === 'busy' || undefined} onClick={() => void startBuyer()}>{buyerLabel[buyer]}</Button>
          <Link to="/app/invoices" {...stylex.props(content.link)}>View invoices</Link>
        </>}
      />
      <StatStrip items={[
        { label: 'Messages', value: state.messages.length, mono: true },
        { label: 'Approvals waiting', value: pending.length, mono: true },
        { label: 'Outstanding', value: money(outstanding), mono: true },
      ]} />
      <div {...stylex.props(content.twoCol)}>
        <Section title="Client channel" description="Simulator thread and agent responses">
          <div {...stylex.props(content.card, content.stack)}>
            <div {...stylex.props(content.row)}><Text role="label">{thread[thread.length - 1]?.channel || 'Simulator channel'}</Text><span {...stylex.props(content.tag)}>Live updates</span></div>
            <div ref={threadRef} {...stylex.props(content.thread)} aria-live="polite">
              {thread.length
                ? thread.map((message) => <MessageBubble key={message.id} state={state} message={message} freshIndex={fresh.get(message.id)} />)
                : <Text role="compact">Send a client commitment to start the thread.</Text>}
              {state.messages.filter((message) => !isTally(message) && message.processed_at === null).map((message) => <div key={`thinking-${message.id}`} {...stylex.props(content.message, content.agentMessage)}><ThinkingState /></div>)}
            </div>
            <form onSubmit={(event) => void submit(event)} {...stylex.props(content.composer)}>
              <select aria-label="Send as" value={author} onChange={(event) => setAuthor(event.target.value)} {...stylex.props(content.input)}>
                {authors.map((name) => <option key={name}>{name}</option>)}
              </select>
              <input aria-label="Message" value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a client message" {...stylex.props(content.input)} />
              <Button variant="primary" type="submit" disabled={busy || !messageText.trim()}><span {...stylex.props(content.iconLabel)}><HugeiconsIcon icon={SentIcon} size={16} strokeWidth={1.5} aria-hidden="true" {...stylex.props(content.icon)} />{busy ? 'Sending' : 'Send'}</span></Button>
              {error ? <p role="alert" {...stylex.props(content.formError)}>{error}</p> : null}
            </form>
          </div>
        </Section>
        <Section title="Pending approvals" description="Review before billing">
          <div {...stylex.props(content.card)}>
            {pending.length
              ? <RowList>{pending.map((approval) => <ApprovalItem key={approval.id} approval={approval} busy={busyApproval === approval.message_id} leaving={decided.has(approval.message_id)} onDecide={(id, action) => void decide(id, action)} />)}</RowList>
              : <Text role="compact">No approvals are waiting. New requests will appear here.</Text>}
          </div>
        </Section>
      </div>
    </Page>
  )
}
