import { Hono } from 'hono'
import { startBuyerOrder } from './buyer'

export const buyerRoutes = new Hono()

buyerRoutes.post('/start', (context) => context.json({ message: startBuyerOrder() }, 201))
