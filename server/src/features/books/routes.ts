import { Hono } from 'hono'
import { journalsCsv } from './books'
import { bookedLines, invoiceBooks, syncBooks } from './sync'

export const booksRoutes = new Hono()

booksRoutes.get('/journals', (context) => {
  syncBooks()
  return context.json({ invoices: invoiceBooks() })
})

booksRoutes.get('/journals.csv', (context) => {
  syncBooks()
  return context.body(journalsCsv(bookedLines()), 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="tally-journals.csv"',
  })
})
