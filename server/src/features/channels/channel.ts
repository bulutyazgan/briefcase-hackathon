import { insertMessage, type ChannelMessage } from '../ledger/store'
import { sendSlackMessage } from './slack'
import { sendTelegramMessage } from './telegram'

export interface ChannelAttachment {
  name: string
  content: string
}

export async function reply(
  source: ChannelMessage,
  text: string,
  attachments: ChannelAttachment[] = [],
  options: { approvalFor?: string } = {},
): Promise<void> {
  if (source.channel.startsWith('slack:')) {
    await sendSlackMessage(source, text, attachments)
  }
  if (source.channel.startsWith('telegram:')) {
    await sendTelegramMessage(source, text, attachments, options.approvalFor).catch((error: unknown) => console.error(`Telegram reply failed: ${String(error)}`))
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
