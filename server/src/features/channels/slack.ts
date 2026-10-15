import { App } from '@slack/bolt'
import { insertMessage, type ChannelMessage } from '../ledger/store'

let slackApp: App | null = null

export async function startSlack(): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN
  const appToken = process.env.SLACK_APP_TOKEN
  if (!botToken || !appToken) return

  slackApp = new App({ token: botToken, appToken, socketMode: true })
  slackApp.message(async ({ message }) => {
    if (!('text' in message) || typeof message.text !== 'string') return
    const text = message.text
    if (!('channel' in message) || typeof message.channel !== 'string') return
    if (!('ts' in message) || typeof message.ts !== 'string') return
    const source = message
    insertMessage({
      id: `slack-${source.channel}-${source.ts}`,
      channel: `slack:${source.channel}`,
      thread: 'thread_ts' in source && typeof source.thread_ts === 'string' ? source.thread_ts : source.ts,
      author: 'user' in source && typeof source.user === 'string' ? source.user : 'client',
      text,
      ts: source.ts,
      processed_at: null,
    })
  })
  await slackApp.start()
  console.info('Slack Socket Mode is connected.')
}

// Outbound post to a channel that is not a client thread (the staff channel). No-op until Slack is connected.
export async function postSlackText(channel: string, text: string): Promise<void> {
  if (!slackApp) return
  await slackApp.client.chat.postMessage({ channel, text })
}

export async function sendSlackMessage(
  message: ChannelMessage,
  text: string,
  attachments: Array<{ name: string; content: string }> = [],
): Promise<void> {
  if (!slackApp || !message.channel.startsWith('slack:')) return
  const channel = message.channel.slice('slack:'.length)
  await slackApp.client.chat.postMessage({
    channel,
    thread_ts: message.thread,
    text,
    attachments: attachments.map((attachment) => ({
      title: attachment.name,
      text: attachment.content,
    })),
  })
}
