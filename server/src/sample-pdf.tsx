import { renderInvoicePdf } from './features/invoice-pdf/render'
import { insertMessage, recordEvent, saveInvoice, updateInvoice } from './features/ledger/store'

const sampleId = 'sample-invoice'
insertMessage({
  id: sampleId,
  channel: 'simulator',
  thread: sampleId,
  author: 'Client — Northwind',
  text: "Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time.",
  ts: new Date().toISOString(),
  processed_at: new Date().toISOString(),
})
saveInvoice({
  id: sampleId,
  message_id: sampleId,
  stripe_invoice_id: 'in_sample',
  client_id: 'cus_sample',
  total_pence: 108000,
  status: 'open',
  hosted_url: 'https://example.com/invoice',
  pdf_path: null,
})
recordEvent({
  id: crypto.randomUUID(),
  message_id: sampleId,
  step: 'decide',
  summary: 'Sample decision evidence for PDF rendering.',
  data_json: JSON.stringify({ policy_clause: ['P1', 'P2', 'P3', 'P4'] }) ?? 'null',
  policy_clause: 'P1,P2,P3,P4',
})
const outputPath = await renderInvoicePdf({
  invoiceId: sampleId,
  totalPence: 108000,
  lines: [{
    description: 'Fintech CFO leads in London (3 sourced)',
    quantity: 300,
    unitPricePence: 400,
    totalPence: 108000,
    quote: "Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time.",
    memoryFact: '2026-08-12: Agreed 10% off orders over 200 leads',
    clauses: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
  }],
})
updateInvoice(sampleId, 'open', undefined, outputPath)
console.info(`Created ${outputPath}`)
