import { isReadOnlyMode } from '../../app-state'

export async function sendMessage(author: string, text: string): Promise<void> {
  if (isReadOnlyMode()) throw new Error('This demo is read-only.')
  const response = await fetch('/api/channels/simulator/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author, text }),
  })
  if (!response.ok) throw new Error(`Message was not sent (${response.status}).`)
}

export async function decideApproval(messageId: string, action: 'approve' | 'reject'): Promise<void> {
  if (isReadOnlyMode()) throw new Error('This demo is read-only.')
  const response = await fetch(`/api/approvals/${messageId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (!response.ok) throw new Error(`Approval was not updated (${response.status}).`)
}

export async function startBuyerAgent(): Promise<void> {
  if (isReadOnlyMode()) throw new Error('This demo is read-only.')
  const response = await fetch('/api/buyer/start', { method: 'POST' })
  if (!response.ok) throw new Error(`Buyer agent did not start (${response.status}).`)
}
