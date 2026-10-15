import { Hono } from 'hono'
import { z } from 'zod'
import { getLatestThreadForAuthor, insertMessage } from '../ledger/store'

const messageInput = z.object({
  author: z.string().min(1).default('Client — Northwind'),
  text: z.string().min(1),
  thread: z.string().optional(),
})

export const channelRoutes = new Hono()

channelRoutes.post('/simulator/messages', async (context) => {
  const parsed = messageInput.safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: 'Add an author and message.' }, 400)
  const id = crypto.randomUUID()
  const message = insertMessage({
    id,
    channel: 'simulator',
    thread: parsed.data.thread ?? getLatestThreadForAuthor('simulator', parsed.data.author) ?? id,
    author: parsed.data.author,
    text: parsed.data.text,
    ts: new Date().toISOString(),
    processed_at: null,
  })
  return context.json({ message }, 201)
})
