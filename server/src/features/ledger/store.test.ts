import { beforeEach, describe, expect, test } from 'bun:test'
import { getState, listEvents, recordEvent, resetLedger } from './store'

function event(id: string, messageId: string, step: string): void {
  recordEvent({ id, message_id: messageId, step, summary: `${step} ${id}`, data_json: '{}', policy_clause: null })
}

function meterRows(messageId: string, count: number): void {
  for (let index = 0; index < count; index += 1) event(`meter-${messageId}-${index}`, messageId, 'meter')
}

beforeEach(() => {
  resetLedger()
})

describe('the state events window', () => {
  test('serves the decide row of an order after 300 meter rows land on top of it', () => {
    event('decide-1', 'order-1', 'decide')
    meterRows('order-1', 300)
    expect(getState().events.some((row) => row.id === 'decide-1')).toBe(true)
    expect(listEvents('order-1').some((row) => row.id === 'decide-1')).toBe(true)
  })

  test('still lists usage metering, bounded', () => {
    event('decide-1', 'order-1', 'decide')
    meterRows('order-1', 300)
    const metered = getState().events.filter((row) => row.step === 'meter')
    expect(metered.length).toBeGreaterThan(0)
    expect(metered.length).toBeLessThanOrEqual(250)
  })

  test('keeps newest first across both slices, so the latest decide row is found first', async () => {
    event('decide-priced', 'order-1', 'decide')
    await Bun.sleep(5)
    meterRows('order-1', 300)
    await Bun.sleep(5)
    event('decide-sourced', 'order-1', 'decide')
    const served = getState().events
    const sourced = served.findIndex((row) => row.id === 'decide-sourced')
    const priced = served.findIndex((row) => row.id === 'decide-priced')
    expect(sourced).toBeGreaterThanOrEqual(0)
    expect(sourced).toBeLessThan(priced)
    expect(served.slice(sourced + 1, priced).some((row) => row.step === 'meter')).toBe(true)
  })
})
