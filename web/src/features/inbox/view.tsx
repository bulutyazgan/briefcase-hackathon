import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { HugeiconsIcon } from '@hugeicons/react'
import { SentIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import type { AppState, ApprovalRow, ChannelMessage, EventRow } from '../../api'
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
import { Link } from '../../router'
import { evidenceFromEvent } from '../invoices/api'
import { decideApproval, sendMessage } from './api'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stepName(event: EventRow): string {
  if (event.step === 'extract') return 'Understood the request'
  if (event.step === 'recall') return 'Recalled from memory'
  if (event.step === 'size' || event.step === 'leads' || event.step === 'lead_sizing' || event.step === 'source_leads') return 'Sourced leads'
  if (event.step === 'price') return 'Checked the price'
  if (event.step === 'decide' || event.step === 'policy') return 'Checked policy'
  if (event.step === 'billing' || event.step === 'bill') return 'Created invoice'
  if (event.step === 'client_identified') return 'Found client in CRM'
  if (event.step === 'converse') return 'Replied to client'
  if (event.step === 'staff_note') return 'Noted for staff'
  if (event.step === 'company_learned') return 'Learned company details'
  if (event.step === 'plan_change') {
    try {
      const data: unknown = JSON.parse(event.data_json)
      if (isRecord(data) && typeof data.to === 'string') return `Switched to ${data.to}`
    } catch {
      return 'Changed the plan'
    }
    return 'Changed the plan'
  }
  return event.step.replaceAll('_', ' ').replace(/(^\w|\s\w)/g, (word) => word.toUpperCase())
}

function AgentReasoning({ state, message, events: providedEvents, open = false }: { state: AppState; message: ChannelMessage; events?: EventRow[]; open?: boolean }) {
  const events = providedEvents ?? messageEvents(state, message)
  const steps = events.map((event) => ({ name: stepName(event), detail: event.summary }))
  if (!steps.length) return null
  const start = Date.parse(events[0].created_at)
  const end = Date.parse(events[events.length - 1].created_at)
  return <ThinkingReasoning seconds={Math.max(1, Math.round((end - start) / 1000))} steps={steps} open={open} />
}

type ReplayItem =
  | { kind: 'message'; key: string; timestamp: string; message: ChannelMessage }
  | { kind: 'event'; key: string; timestamp: string; event: EventRow; message: ChannelMessage }

function replayItemsFor(state: AppState): { threadId: string | null; messages: ChannelMessage[]; items: ReplayItem[] } {
  const planChange = [...state.events]
    .filter((event) => event.step === 'plan_change')
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
  const messageById = new Map(state.messages.map((message) => [message.id, message]))
  const firstMessageByThread = new Map<string, ChannelMessage>()
  for (const message of state.messages) {
    if (!firstMessageByThread.has(message.thread)) firstMessageByThread.set(message.thread, message)
  }
  let threadId: string | null = null
  for (const event of planChange) {
    const linked = messageById.get(event.message_id) ?? firstMessageByThread.get(event.message_id)
    if (linked) {
      threadId = linked.thread
      break
    }
  }
  threadId ??= [...state.messages].sort((left, right) => right.ts.localeCompare(left.ts))[0]?.thread ?? null
  const messages = threadId
    ? state.messages.filter((message) => message.thread === threadId).sort((left, right) => left.ts.localeCompare(right.ts))
    : []
  const messageIds = new Set(messages.map((message) => message.id))
  const threadMessageById = new Map(messages.map((message) => [message.id, message]))
  const events = state.events.filter((event) => messageIds.has(event.message_id) || event.message_id === threadId)
  const messageItems: ReplayItem[] = messages.map((message) => ({
    kind: 'message',
    key: `message-${message.id}`,
    timestamp: message.ts,
    message,
  }))
  const eventItems: ReplayItem[] = events.flatMap((event) => {
    const message = threadMessageById.get(event.message_id) ?? messages[0]
    return message ? [{
      kind: 'event' as const,
      key: `event-${event.id}`,
      timestamp: event.created_at,
      event,
      message,
    }] : []
  })
  const compareItems = (left: ReplayItem, right: ReplayItem) =>
    left.timestamp.localeCompare(right.timestamp)
    || (left.kind === right.kind ? left.key.localeCompare(right.key) : left.kind === 'message' ? -1 : 1)
  const conversationItems = [
    ...messageItems.filter((item) => item.kind === 'message' && !isTally(item.message)),
    ...eventItems,
  ].sort(compareItems)
  const tallyItems = messageItems.filter((item) => item.kind === 'message' && isTally(item.message)).sort(compareItems)
  const items = [...conversationItems, ...tallyItems]
  return { threadId, messages, items }
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

function MessageBubble({ state, message, showReasoning = true }: { state: AppState; message: ChannelMessage; showReasoning?: boolean }) {
  const tally = isTally(message)
  return (
    <article {...stylex.props(content.message, tally ? content.agentMessage : content.clientMessage)}>
      <div {...stylex.props(content.messageTop)}>
        <Text role="label">{message.author}</Text>
        <span {...stylex.props(content.timestamp)}>{new Date(message.ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>
      {tally
        ? <><TextResponse>{message.text}</TextResponse><AgentCitations state={state} message={message} />{showReasoning ? <AgentReasoning state={state} message={message} /> : null}</>
        : <Text role="compact">{message.text}</Text>}
    </article>
  )
}

function ReplayEvent({ state, event, message }: { state: AppState; event: EventRow; message: ChannelMessage }) {
  return (
    <article {...stylex.props(content.message, content.agentMessage)}>
      <div {...stylex.props(content.messageTop)}>
        <Text role="label">{stepName(event)}</Text>
        <span {...stylex.props(content.timestamp)}>{new Date(event.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>
      <AgentReasoning state={state} message={message} events={[event]} open />
    </article>
  )
}

function ApprovalItem({ approval, busy, readOnly, onDecide }: { approval: ApprovalRow; busy: boolean; readOnly: boolean; onDecide: (id: string, action: 'approve' | 'reject') => void }) {
  return (
    <RowListItem id={approval.id}>
      <div {...stylex.props(content.stack, content.full)}>
        <div {...stylex.props(content.row)}><Text role="heading16">Approval needed</Text><span {...stylex.props(content.id)}>{approval.message_id.slice(0, 8)}</span></div>
        <Text role="compact">{approval.reason}</Text>
        {!readOnly ? <div {...stylex.props(content.approvalActions)}>
          <Button variant="primary" disabled={busy} onClick={() => onDecide(approval.message_id, 'approve')}><span {...stylex.props(content.iconLabel)}><HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={1.5} aria-hidden="true" {...stylex.props(content.icon)} />Approve invoice</span></Button>
          <Button disabled={busy} onClick={() => onDecide(approval.message_id, 'reject')}>Reject</Button>
        </div> : null}
      </div>
    </RowListItem>
  )
}

export function Inbox({ state, onRefresh, readOnly }: { state: AppState; onRefresh: () => void; readOnly: boolean }) {
  const [author, setAuthor] = useState('Client — Northwind')
  const [messageText, setMessageText] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyApproval, setBusyApproval] = useState('')
  const [error, setError] = useState('')
  const [replayRun, setReplayRun] = useState(0)
  const [visibleReplayItems, setVisibleReplayItems] = useState(0)
  const [replayActive, setReplayActive] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const autoplayed = useRef(false)
  const replay = useMemo(() => replayItemsFor(state), [state])
  const thread = readOnly ? replay.messages : state.messages.slice(-40)
  const channel = thread[thread.length - 1]?.channel || 'Simulator channel'
  const pending = state.approvals.filter((approval) => approval.status === 'pending')
  const outstanding = state.invoices.filter((invoice) => invoice.status !== 'paid').reduce((total, invoice) => total + invoice.total_pence, 0)
  const pendingAmount = pending.map((approval) => reasonAmount(approval.reason)).find((amount) => amount > 0) || outstanding
  const title = pending.length
    ? pendingAmount > 0 ? `${money(pendingAmount)} awaiting your approval` : `${pending.length} approval${pending.length === 1 ? '' : 's'} waiting for review`
    : state.invoices.length ? `${state.invoices.length} invoice${state.invoices.length === 1 ? '' : 's'} in the ledger` : 'Your client commitments are in one place'
  const sectionDescription = readOnly && channel.toLowerCase().startsWith('telegram')
    ? 'Recorded Telegram conversation'
    : 'Simulator thread and agent responses'

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(preference.matches)
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!readOnly || autoplayed.current) return
    autoplayed.current = true
    setReplayRun((run) => run + 1)
  }, [readOnly])

  useEffect(() => {
    if (!readOnly || replayRun === 0) return
    setVisibleReplayItems(0)
    setThinking(false)
    if (prefersReducedMotion) {
      setVisibleReplayItems(replay.items.length)
      setReplayActive(false)
      return
    }

    let index = 0
    let timeout: number | null = null
    setReplayActive(replay.items.length > 0)
    const revealNext = () => {
      const item = replay.items[index]
      if (!item) {
        setReplayActive(false)
        setThinking(false)
        return
      }
      const tallyReply = item.kind === 'message' && isTally(item.message)
      setThinking(tallyReply)
      timeout = window.setTimeout(() => {
        index += 1
        setVisibleReplayItems(index)
        setThinking(false)
        revealNext()
      }, tallyReply ? 1600 : 900)
    }
    revealNext()
    return () => {
      if (timeout !== null) window.clearTimeout(timeout)
    }
  }, [prefersReducedMotion, readOnly, replay.items, replayRun])

  function replayConversation(): void {
    setReplayRun((run) => run + 1)
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (readOnly || !messageText.trim() || busy) return
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
    if (readOnly) return
    setBusyApproval(id)
    setError('')
    try {
      await decideApproval(id, action)
      onRefresh()
    } catch (decisionError) {
      setError(String(decisionError))
    } finally {
      setBusyApproval('')
    }
  }

  return (
    <Page>
      <Opening title={title} lede="Commitments, approvals and billing evidence stay together." tools={<Link to="/app/invoices" {...stylex.props(content.link)}>View invoices</Link>} />
      <StatStrip items={[
        { label: 'Messages', value: state.messages.length, mono: true },
        { label: 'Approvals waiting', value: pending.length, mono: true },
        { label: 'Outstanding', value: money(outstanding), mono: true },
      ]} />
      <div {...stylex.props(content.twoCol)}>
        <Section title="Client channel" description={sectionDescription}>
          <div {...stylex.props(content.card, content.stack)}>
            <div {...stylex.props(content.row)}><Text role="label">{channel}</Text><span {...stylex.props(content.tag)}>{readOnly ? 'Recorded run' : 'Live updates'}</span></div>
            <div {...stylex.props(content.thread)} aria-live="polite">
              {readOnly
                ? replay.items.slice(0, visibleReplayItems).map((item) => item.kind === 'message'
                  ? <MessageBubble key={item.key} state={state} message={item.message} showReasoning={false} />
                  : <ReplayEvent key={item.key} state={state} event={item.event} message={item.message} />)
                : thread.map((message) => <MessageBubble key={message.id} state={state} message={message} />)}
              {readOnly && replayActive && thinking ? <div {...stylex.props(content.message, content.agentMessage)}><ThinkingState /></div> : null}
              {!readOnly && thread.length === 0 ? <Text role="compact">Send a client commitment to start the thread.</Text> : null}
              {!readOnly ? state.messages.filter((message) => !isTally(message) && message.processed_at === null).map((message) => <div key={`thinking-${message.id}`} {...stylex.props(content.message, content.agentMessage)}><ThinkingState /></div>) : null}
            </div>
            {readOnly ? <div {...stylex.props(content.replayBar)}><Text role="compact">Simulated replay of a real run</Text><Button onClick={replayConversation} disabled={!replay.items.length}>Replay conversation</Button></div> : <form onSubmit={(event) => void submit(event)} {...stylex.props(content.composer)}>
              <select aria-label="Send as" value={author} onChange={(event) => setAuthor(event.target.value)} {...stylex.props(content.input)}>
                <option>Client — Northwind</option><option>Account owner</option>
              </select>
              <input aria-label="Message" value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a client message" {...stylex.props(content.input)} />
              <Button variant="primary" type="submit" disabled={busy || !messageText.trim()}><span {...stylex.props(content.iconLabel)}><HugeiconsIcon icon={SentIcon} size={16} strokeWidth={1.5} aria-hidden="true" {...stylex.props(content.icon)} />{busy ? 'Sending' : 'Send'}</span></Button>
              {error ? <p role="alert" {...stylex.props(content.formError)}>{error}</p> : null}
            </form>}
          </div>
        </Section>
        <Section title="Pending approvals" description="Review before billing">
          <div {...stylex.props(content.card)}>
            {pending.length
              ? <RowList>{pending.map((approval) => <ApprovalItem key={approval.id} approval={approval} busy={busyApproval === approval.message_id} readOnly={readOnly} onDecide={(id, action) => void decide(id, action)} />)}</RowList>
              : <Text role="compact">No approvals are waiting. New requests will appear here.</Text>}
          </div>
        </Section>
      </div>
    </Page>
  )
}
