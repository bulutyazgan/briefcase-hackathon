import { insertMessage, resetLedger } from './features/ledger/store'

resetLedger()
// A need, not a commitment: the opportunity tick spots it after the agent loop finds no order in it.
const id = crypto.randomUUID()
insertMessage({
  id,
  channel: 'simulator',
  thread: id,
  author: 'Client — Northwind',
  text: "We're launching the Q4 push next month and the pipeline is thin.",
  ts: new Date().toISOString(),
  processed_at: null,
})
console.info('Tally ledger reset and seeded with one Northwind need message.')
