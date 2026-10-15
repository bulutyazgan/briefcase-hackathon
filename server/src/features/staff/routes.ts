import { Hono } from 'hono'
import { listStaffNotes } from './staff'

export const staffRoutes = new Hono()

staffRoutes.get('/notes', (context) => context.json({ notes: listStaffNotes() }))
