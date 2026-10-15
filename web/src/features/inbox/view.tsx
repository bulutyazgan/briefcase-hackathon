import { useState, type FormEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import type { AppState, ChannelMessage } from '../../api'
import { decideApproval, sendMessage, startBuyerAgent } from './api'
import { styles } from './inbox.stylex'

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
        <time dateTime={message.ts}>{displayTime(message.ts)}</time>
      </div>
      <p {...stylex.props(styles.messageText)}>{message.text}</p>
    </article>
  )
}

export function Inbox({ state, onRefresh }: InboxProps) {
  const [author, setAuthor] = useState('Client — Northwind')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [approvalBusy, setApprovalBusy] = useState('')
  const messages = [...state.messages]
    .filter((message) => message.channel === 'simulator')
    .sort((first, second) => first.ts.localeCompare(second.ts))
  const pendingApprovals = state.approvals.filter((approval) => approval.status === 'pending')

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

  async function startBuyer() {
    setError('')
    try {
      await startBuyerAgent()
      onRefresh()
    } catch (startError) {
      setError(String(startError))
    }
  }

  async function approve(messageId: string, action: 'approve' | 'reject') {
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
    <section {...stylex.props(styles.panel)} aria-labelledby="inbox-title">
      <header {...stylex.props(styles.header)}>
        <div>
          <h2 id="inbox-title" {...stylex.props(styles.title)}>Client channel</h2>
          <p {...stylex.props(styles.caption)}>Simulator · Northwind Capital</p>
        </div>
        <button type="button" {...stylex.props(styles.button)} onClick={() => void startBuyer()}>
          Start buyer agent
        </button>
        <span aria-label="Agent status">● Live</span>
      </header>
      <div {...stylex.props(styles.feed)} aria-live="polite">
        {messages.length
          ? messages.map((message) => <Message key={message.id} message={message} />)
          : <p {...stylex.props(styles.empty)}>No messages yet. Send a client commitment to start the audit trail.</p>}
        {pendingApprovals.map((approval) => (
          <section key={approval.id} {...stylex.props(styles.approval)} aria-label="Invoice approval">
            <strong {...stylex.props(styles.approvalTitle)}>Approval needed</strong>
            <span>{approval.reason}</span>
            <div {...stylex.props(styles.approvalActions)}>
              <button
                type="button"
                {...stylex.props(styles.approve)}
                disabled={approvalBusy === approval.message_id}
                onClick={() => void approve(approval.message_id, 'approve')}
              >
                Approve invoice
              </button>
              <button
                type="button"
                {...stylex.props(styles.reject)}
                disabled={approvalBusy === approval.message_id}
                onClick={() => void approve(approval.message_id, 'reject')}
              >
                Reject
              </button>
            </div>
          </section>
        ))}
      </div>
      <form {...stylex.props(styles.composer)} onSubmit={submit}>
        <select
          id="message-author"
          aria-label="Send as"
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          {...stylex.props(styles.input)}
        >
          <option>Client — Northwind</option>
          <option>Account owner</option>
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
