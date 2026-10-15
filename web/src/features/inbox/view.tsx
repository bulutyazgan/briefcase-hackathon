import { useState, type FormEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import type { AppState, ApprovalRow, ChannelMessage } from '../../api'
import { formatMoneyText } from '../../format'
import { decideApproval, sendMessage } from './api'
import { styles } from './inbox.stylex'

const authors = [
  'Client — Northwind',
  'Client — Acme',
  'Client — Globex',
  'Account owner',
  'Unknown sender',
] as const

interface InboxProps {
  state: AppState
  onRefresh: () => void
}

function displayTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function Message({ message }: { message: ChannelMessage }) {
  return (
    <article {...stylex.props(styles.message, message.author === 'tally' && styles.tallyMessage)}>
      <div {...stylex.props(styles.messageMeta)}>
        <strong>{message.author}</strong>
        <time dateTime={message.ts} {...stylex.props(styles.timestamp)}>{displayTime(message.ts)}</time>
      </div>
      <p {...stylex.props(styles.messageText)}>{formatMoneyText(message.text)}</p>
    </article>
  )
}

export function Inbox({ state, onRefresh }: InboxProps) {
  const [author, setAuthor] = useState<string>(authors[0])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const messages = [...state.messages]
    .filter((message) => message.channel === 'simulator')
    .sort((first, second) => first.ts.localeCompare(second.ts))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await sendMessage(author, text.trim())
      setText('')
      onRefresh()
    } catch (sendError) {
      setError(String(sendError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section {...stylex.props(styles.panel)} aria-labelledby="inbox-title">
      <header {...stylex.props(styles.header)}>
        <div>
          <h2 id="inbox-title" {...stylex.props(styles.title)}>Client channel</h2>
          <p {...stylex.props(styles.caption)}>Simulator · Northwind Capital</p>
        </div>
        <span aria-label="Agent status" {...stylex.props(styles.live)}>
          <span aria-hidden="true" {...stylex.props(styles.liveDot)} />
          Live
        </span>
      </header>
      <div {...stylex.props(styles.feed)} aria-live="polite">
        {messages.length
          ? messages.map((message) => <Message key={message.id} message={message} />)
          : <p {...stylex.props(styles.empty)}>No messages yet. Send a client commitment to start the audit trail.</p>}
      </div>
      <form {...stylex.props(styles.composer)} onSubmit={submit}>
        <select
          id="message-author"
          aria-label="Send as"
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          {...stylex.props(styles.input)}
        >
          {authors.map((name) => <option key={name}>{name}</option>)}
        </select>
        <input
          id="message-text"
          aria-label="Message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write a client message…"
          {...stylex.props(styles.input)}
        />
        <button type="submit" {...stylex.props(styles.button)} disabled={busy || !text.trim()}>
          Send
        </button>
        {error && <p role="alert" {...stylex.props(styles.error)}>{error}</p>}
      </form>
    </section>
  )
}

function ApprovalCard({
  approval,
  busy,
  onDecide,
}: {
  approval: ApprovalRow
  busy: boolean
  onDecide: (messageId: string, action: 'approve' | 'reject') => void
}) {
  return (
    <article {...stylex.props(styles.approval)}>
      <div {...stylex.props(styles.approvalTopline)}>
        <strong {...stylex.props(styles.approvalTitle)}>Approval needed</strong>
        <span {...stylex.props(styles.approvalId)}>{approval.message_id.slice(0, 8)}</span>
      </div>
      <p {...stylex.props(styles.approvalReason)}>{formatMoneyText(approval.reason)}</p>
      <div {...stylex.props(styles.approvalActions)}>
        <button
          type="button"
          {...stylex.props(styles.approve)}
          disabled={busy}
          onClick={() => onDecide(approval.message_id, 'approve')}
        >
          Approve invoice
        </button>
        <button
          type="button"
          {...stylex.props(styles.reject)}
          disabled={busy}
          onClick={() => onDecide(approval.message_id, 'reject')}
        >
          Reject
        </button>
      </div>
    </article>
  )
}

export function PendingApprovals({ state, onRefresh }: InboxProps) {
  const [approvalBusy, setApprovalBusy] = useState('')
  const [error, setError] = useState('')
  const pendingApprovals = state.approvals.filter((approval) => approval.status === 'pending')

  async function decide(messageId: string, action: 'approve' | 'reject'): Promise<void> {
    setApprovalBusy(messageId)
    setError('')
    try {
      await decideApproval(messageId, action)
      onRefresh()
    } catch (approvalError) {
      setError(String(approvalError))
    } finally {
      setApprovalBusy('')
    }
  }

  return (
    <section {...stylex.props(styles.approvalPanel)} aria-labelledby="pending-approvals-title">
      <header {...stylex.props(styles.approvalHeader)}>
        <div>
          <h2 id="pending-approvals-title" {...stylex.props(styles.title)}>Pending approvals</h2>
          <p {...stylex.props(styles.caption)}>Review before billing</p>
        </div>
        <span {...stylex.props(styles.approvalCount)}>{pendingApprovals.length}</span>
      </header>
      <div {...stylex.props(styles.approvalList)}>
        {pendingApprovals.length
          ? pendingApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              busy={approvalBusy === approval.message_id}
              onDecide={(messageId, action) => void decide(messageId, action)}
            />
          ))
          : <p {...stylex.props(styles.emptyApproval)}>No approvals are waiting. New requests will appear here.</p>}
        {error && <p role="alert" {...stylex.props(styles.error)}>{error}</p>}
      </div>
    </section>
  )
}
