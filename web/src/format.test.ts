import { describe, expect, test } from 'bun:test'
import { formatMoneyText } from './format'

describe('formatMoneyText', () => {
  test('groups thousands in raw pound amounts', () => {
    expect(formatMoneyText('Invoice for £1080.00 is ready.')).toBe('Invoice for £1,080.00 is ready.')
    expect(formatMoneyText('£1080 plus VAT')).toBe('£1,080 plus VAT')
    expect(formatMoneyText('Total £1234567.50')).toBe('Total £1,234,567.50')
  })

  test('leaves already grouped and small amounts alone', () => {
    expect(formatMoneyText('Auto-send up to £1,000.')).toBe('Auto-send up to £1,000.')
    expect(formatMoneyText('Why £1,080.00?')).toBe('Why £1,080.00?')
    expect(formatMoneyText('300 leads at £4 each is £400.')).toBe('300 leads at £4 each is £400.')
  })

  test('formats every amount in a reason', () => {
    expect(formatMoneyText('£1080.00 exceeds the £1000.00 auto-send limit (P4).'))
      .toBe('£1,080.00 exceeds the £1,000.00 auto-send limit (P4).')
  })
})
