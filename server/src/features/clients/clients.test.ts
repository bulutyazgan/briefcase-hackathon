import { describe, expect, test } from 'bun:test'
import { findClient } from './clients'

describe('findClient', () => {
  test('finds seeded clients by name or channel author', () => {
    expect(findClient('Northwind Capital')?.pricePerLeadPence).toBe(400)
    expect(findClient('Client — Northwind')?.name).toBe('Northwind Capital')
    expect(findClient('acme')?.pricePerLeadPence).toBe(500)
    expect(findClient('Globex Partners')?.pricePerLeadPence).toBe(400)
  })

  test('returns null for unknown senders (P5)', () => {
    expect(findClient('Initech')).toBeNull()
    expect(findClient('')).toBeNull()
  })
})
