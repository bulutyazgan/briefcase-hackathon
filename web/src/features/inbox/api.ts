export async function sendMessage(author: string, text: string): Promise<void> {
  const response = await fetch('/api/channels/simulator/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author, text }),
  })
  if (!response.ok) throw new Error(`Message was not sent (${response.status}).`)
}

export async function decideApproval(messageId: string, action: 'approve' | 'reject'): Promise<void> {
  const response = await fetch(`/api/approvals/${messageId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (!response.ok) throw new Error(`Approval was not updated (${response.status}).`)
}
