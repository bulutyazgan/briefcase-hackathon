import { beforeEach, describe, expect, test } from 'bun:test'
import { PENCE_PER_USD } from '../pricing/pricing'
import { recordEvent, resetLedger, saveInvoice, updateInvoice } from '../ledger/store'
import {
  CSV_COLUMNS,
  costOfSaleJournal,
  creditNoteJournal,
  invoiceJournal,
  isBalanced,
  journalsCsv,
  paymentJournal,
  vatBreakdown,
  vatBreakdownText,
} from './books'
import { bookedLines, invoiceBooks, syncBooks } from './sync'
import { ensureVatTaxRate, resetVatTaxRateCache, VAT_TAX_RATE, type TaxRateClient } from './vat-rate'

const invoice = { invoiceId: 'msg-1', reference: 'in_test_1', date: '2026-10-15', netPence: 108_000 }

function fakeTaxRates(existing: { id: string; display_name: string; percentage: number; inclusive: boolean; country: string | null; active: boolean }[]) {
  const created: string[] = []
  const client: TaxRateClient = {
    taxRates: {
      list: async () => ({ data: existing }),
      create: async (params, options) => {
        created.push(options.idempotencyKey)
        return { id: 'txr_new', active: true, ...params }
      },
    },
  }
  return { client, created }
}

describe('VAT', () => {
  test('£1,080 net carries £216 VAT for £1,296 gross', () => {
    expect(vatBreakdown(108_000)).toEqual({ netPence: 108_000, vatPence: 21_600, grossPence: 129_600 })
    expect(vatBreakdownText(108_000)).toBe('£1,080.00 net + £216.00 VAT (20%) = £1,296.00')
  })

  test('reuses an existing 20% exclusive GB VAT rate', async () => {
    resetVatTaxRateCache()
    const { client, created } = fakeTaxRates([
      { id: 'txr_inclusive', display_name: 'VAT', percentage: 20, inclusive: true, country: 'GB', active: true },
      { id: 'txr_existing', display_name: 'VAT', percentage: 20, inclusive: false, country: 'GB', active: true },
    ])
    expect(await ensureVatTaxRate(client)).toBe('txr_existing')
    expect(created).toEqual([])
  })

  test('creates the rate once when none matches', async () => {
    resetVatTaxRateCache()
    const { client, created } = fakeTaxRates([])
    expect(await ensureVatTaxRate(client)).toBe('txr_new')
    expect(await ensureVatTaxRate(client)).toBe('txr_new')
    expect(created).toEqual(['tally-uk-vat-20-exclusive'])
    expect(VAT_TAX_RATE).toMatchObject({ percentage: 20, inclusive: false, country: 'GB', display_name: 'VAT' })
  })
})

describe('journals', () => {
  test('invoice finalised: Dr Debtors gross, Cr Sales net, Cr VAT output', () => {
    const journal = invoiceJournal(invoice)
    expect(isBalanced(journal)).toBe(true)
    expect(journal.lines.map((line) => [line.account, line.debitPence, line.creditPence])).toEqual([
      ['Debtors', 129_600, 0],
      ['Sales', 0, 108_000],
      ['VAT output', 0, 21_600],
    ])
  })

  test('cost of sale converts micro-USD with the pricing FX constant', () => {
    const journal = costOfSaleJournal(invoice, 25_000_000)
    expect(isBalanced(journal)).toBe(true)
    expect(journal.lines[0]).toMatchObject({ account: 'Cost of sales', debitPence: 25 * PENCE_PER_USD })
    expect(journal.lines[1]).toMatchObject({ account: 'Creditors: Lead data supplier', creditPence: 25 * PENCE_PER_USD })
  })

  test('payment and credit note balance', () => {
    const payment = paymentJournal(invoice, '2026-10-16')
    expect(isBalanced(payment)).toBe(true)
    expect(payment.lines.map((line) => line.account)).toEqual(['Bank', 'Debtors'])
    const note = creditNoteJournal(invoice, { creditNoteId: 'cn_1', date: '2026-10-17', netPence: 10_800 })
    expect(isBalanced(note)).toBe(true)
    expect(note.lines.map((line) => [line.account, line.debitPence, line.creditPence])).toEqual([
      ['Sales', 10_800, 0],
      ['VAT output', 2_160, 0],
      ['Debtors', 0, 12_960],
    ])
  })
})

describe('books from the ledger', () => {
  beforeEach(() => resetLedger())

  function seedPaidInvoiceWithCreditNote(): void {
    saveInvoice({
      id: 'msg-1',
      message_id: 'msg-1',
      stripe_invoice_id: 'in_test_1',
      client_id: 'cus_1',
      total_pence: 108_000,
      status: 'open',
      hosted_url: 'https://invoice.stripe.test/1',
      pdf_path: null,
    })
    recordEvent({
      id: 'evt-source',
      message_id: 'msg-1',
      step: 'source',
      summary: 'Bought leads.',
      data_json: JSON.stringify({ source: 'vendor-x', costMicro: 100_000_000 }),
      policy_clause: null,
    })
    updateInvoice('msg-1', 'paid')
    recordEvent({
      id: 'evt-paid',
      message_id: 'msg-1',
      step: 'paid',
      summary: 'Paid.',
      data_json: '{}',
      policy_clause: null,
    })
    recordEvent({
      id: 'evt-credit',
      message_id: 'msg-1',
      step: 'credit_note',
      summary: 'Credited one lead.',
      data_json: JSON.stringify({ creditNoteId: 'cn_1', amountPence: 10_800 }),
      policy_clause: null,
    })
  }

  test('posts every journal once, balanced, with margin per invoice', () => {
    seedPaidInvoiceWithCreditNote()
    syncBooks()
    syncBooks()
    const lines = bookedLines()
    expect(lines).toHaveLength(3 + 2 + 2 + 3)
    const debits = lines.reduce((sum, line) => sum + line.debitPence, 0)
    const credits = lines.reduce((sum, line) => sum + line.creditPence, 0)
    expect(debits).toBe(credits)
    expect(invoiceBooks()).toEqual([{
      invoiceId: 'msg-1',
      reference: 'in_test_1',
      netPence: 97_200,
      vatPence: 19_440,
      grossPence: 116_640,
      costPence: 7_900,
      marginPence: 89_300,
      marginRatio: 89_300 / 97_200,
      paid: true,
    }])
  })

  test('CSV has Xero columns, one row per line, and no provider names', () => {
    seedPaidInvoiceWithCreditNote()
    syncBooks()
    const csv = journalsCsv(bookedLines())
    const [header, ...rows] = csv.split('\n')
    expect(header).toBe(CSV_COLUMNS.join(','))
    expect(header).toBe('Date,Reference,Account,Description,Debit,Credit,TaxRate')
    expect(rows).toHaveLength(10)
    expect(rows[0]).toMatch(/^\d{4}-\d{2}-\d{2},in_test_1,Debtors,Lead list invoice,1296\.00,,No VAT$/)
    expect(rows).toContain(`${rows[1]?.slice(0, 10)},in_test_1,Sales,Lead list invoice,,1080.00,20% (VAT on Income)`)
    expect(csv).not.toMatch(/treg|vendor-x|firecrawl/i)
  })
})
