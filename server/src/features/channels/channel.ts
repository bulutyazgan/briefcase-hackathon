import { insertMessage, type ChannelMessage } from '../ledger/store'
import { sendSlackMessage } from './slack'

export interface ChannelAttachment {
  name: string
  content: string
}

export async function reply(
  source: ChannelMessage,
  text: string,
  attachments: ChannelAttachment[] = [],
): Promise<void> {
  if (source.channel.startsWith('slack:')) {
    await sendSlackMessage(source, text, attachments)
  }
  const attachmentText = attachments.map((item) => `${item.name}: ${item.content}`).join('\n')
  insertMessage({
    id: crypto.randomUUID(),
    channel: source.channel,
    thread: source.thread,
    author: 'tally',
    text: attachmentText ? `${text}\n${attachmentText}` : text,
    ts: new Date().toISOString(),
    processed_at: new Date().toISOString(),
  })
}
