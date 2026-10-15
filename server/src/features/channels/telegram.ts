import { insertMessage, type ChannelMessage } from '../ledger/store'

type ApprovalAction = 'approve' | 'reject'
type ApprovalHandler = (messageId: string, action: ApprovalAction) => Promise<string>

interface TelegramUpdate {
  update_id: number
  message?: { message_id: number; date: number; text?: string; chat: { id: number }; from?: { first_name?: string; username?: string } }
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } }
}

const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
const apiBase = `https://api.telegram.org/bot${token}`

async function call(method: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${apiBase}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload: unknown = await response.json()
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(payload)}`)
  return payload
}

function absolute(text: string): string {
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, '')
  return base ? text.replace(/(^|\s)(\/api\/\S+)/g, `$1${base}$2`) : text
}

export async function startTelegram(onApproval: ApprovalHandler): Promise<void> {
  if (!token) return
  await call('deleteWebhook', { drop_pending_updates: false })
  console.info('Telegram long polling is connected.')
  let offset = 0
  for (;;) {
    try {
      const payload = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] })
      const updates: TelegramUpdate[] = typeof payload === 'object' && payload && 'result' in payload && Array.isArray(payload.result) ? payload.result : []
      for (const update of updates) {
        offset = update.update_id + 1
        await handleUpdate(update, onApproval)
      }
    } catch (error) {
      console.error(`Telegram polling failed: ${String(error)}`)
      await Bun.sleep(3000)
    }
  }
}

async function handleUpdate(update: TelegramUpdate, onApproval: ApprovalHandler): Promise<void> {
  const message = update.message
  if (message?.text) {
    if (message.text.startsWith('/start')) {
      await call('sendMessage', { chat_id: message.chat.id, text: 'Tally is listening. Tell me what work you want to commit to, and I will bill it by the written policy.' })
      return
    }
    insertMessage({
      id: `telegram-${message.chat.id}-${message.message_id}`,
      channel: `telegram:${message.chat.id}`,
      thread: String(message.message_id),
      author: process.env.TELEGRAM_CLIENT_NAME?.trim() || message.from?.first_name || message.from?.username || 'client',
      text: message.text,
      ts: new Date(message.date * 1000).toISOString(),
      processed_at: null,
    })
    await call('sendChatAction', { chat_id: message.chat.id, action: 'typing' }).catch(() => undefined)
    return
  }
  const query = update.callback_query
  if (!query?.data) return
  const [action, messageId] = query.data.split(':')
  if ((action !== 'approve' && action !== 'reject') || !messageId) return
  const result = await onApproval(messageId, action).catch((error: unknown) => String(error))
  await call('answerCallbackQuery', { callback_query_id: query.id, text: result })
  if (query.message) {
    await call('editMessageReplyMarkup', { chat_id: query.message.chat.id, message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined)
  }
}

export async function sendTelegramMessage(
  source: ChannelMessage,
  text: string,
  attachments: Array<{ name: string; content: string }>,
  approvalFor?: string,
): Promise<void> {
  if (!token || !source.channel.startsWith('telegram:')) return
  const chatId = source.channel.slice('telegram:'.length)
  await call('sendMessage', {
    chat_id: chatId,
    text: absolute(text).slice(0, 4000),
    reply_parameters: { message_id: Number(source.thread), allow_sending_without_reply: true },
    link_preview_options: { is_disabled: true },
    ...(approvalFor ? {
      reply_markup: { inline_keyboard: [[
        { text: 'Approve', callback_data: `approve:${approvalFor}` },
        { text: 'Reject', callback_data: `reject:${approvalFor}` },
      ]] },
    } : {}),
  })
  for (const attachment of attachments) {
    const form = new FormData()
    form.append('chat_id', chatId)
    form.append('document', new Blob([attachment.content.replace(/^\/api\/\S+\n/, '')], { type: 'text/csv' }), attachment.name)
    await fetch(`${apiBase}/sendDocument`, { method: 'POST', body: form })
  }
}

export async function sendTelegramPdf(source: ChannelMessage, pdfPath: string, caption: string): Promise<void> {
  if (!token || !source.channel.startsWith('telegram:')) return
  const form = new FormData()
  form.append('chat_id', source.channel.slice('telegram:'.length))
  form.append('caption', caption)
  form.append('document', Bun.file(pdfPath), 'tally-invoice.pdf')
  await fetch(`${apiBase}/sendDocument`, { method: 'POST', body: form })
}
