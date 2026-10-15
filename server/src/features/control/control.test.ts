import { beforeEach, describe, expect, test } from 'bun:test'

process.env.TALLY_DB_PATH = ':memory:'
process.env.ACCOUNT_OWNER = 'Account owner'
delete process.env.SLACK_BOT_TOKEN

const store = await import('../ledger/store')
const control = await import('./control')

function message(author: string, text: string): ReturnType<typeof store.insertMessage> {
  return store.insertMessage({
    id: crypto.randomUUID(),
    channel: 'simulator',
    thread: 'thread-1',
    author,
    text,
    ts: new Date().toISOString(),
    processed_at: null,
  })
}

describe('kill switch', () => {
  beforeEach(() => {
    store.resetLedger()
    store.setSetting('control.paused', 'false')
  })

  test('/pause sets paused and records an F1 event', async () => {
    const pause = message('Client — Northwind', '/pause')
    expect(await control.handleControlCommand(pause)).toBe(true)
    expect(control.isPaused()).toBe(true)
    expect(store.getEvent(pause.id, 'kill_switch')?.policy_clause).toBe('F1')
    expect(store.getMessage(pause.id)?.processed_at).not.toBeNull()
  })

  test('assertNotPaused throws only while paused', async () => {
    expect(() => control.assertNotPaused()).not.toThrow()
    await control.handleControlCommand(message('anyone', '/pause'))
    expect(() => control.assertNotPaused()).toThrow(control.KillSwitchError)
  })

  test('paused agent consumes other messages and blocks billing with F1', async () => {
    await control.handleControlCommand(message('anyone', '/pause'))
    const order = message('Client — Northwind', "Let's do 40 fintech CFO leads")
    expect(await control.handleControlCommand(order)).toBe(true)
    expect(store.getEvent(order.id, 'kill_switch_blocked')?.policy_clause).toBe('F1')
    const approved = message('Client — Northwind', 'approved order')
    expect(await control.blockIfPaused(approved)).toBe(true)
    expect(store.getEvent(approved.id, 'kill_switch_blocked')?.policy_clause).toBe('F1')
  })

  test('/resume from a non-owner is ignored', async () => {
    await control.handleControlCommand(message('anyone', '/pause'))
    expect(await control.handleControlCommand(message('Client — Northwind', '/resume'))).toBe(true)
    expect(control.isPaused()).toBe(true)
  })

  test('/resume from the account owner resumes', async () => {
    await control.handleControlCommand(message('anyone', '/pause'))
    expect(await control.handleControlCommand(message('Account owner', ' /RESUME '))).toBe(true)
    expect(control.isPaused()).toBe(false)
    expect(await control.handleControlCommand(message('Client — Northwind', 'hello'))).toBe(false)
    expect(await control.blockIfPaused(message('Client — Northwind', 'hello'))).toBe(false)
  })
})

describe('key mode', () => {
  test('detects restricted, secret and missing keys', () => {
    expect(control.detectKeyMode('rk_test_abc')).toBe('restricted')
    expect(control.detectKeyMode('sk_test_abc')).toBe('secret')
    expect(control.detectKeyMode('sk_live_abc')).toBe('missing')
    expect(control.detectKeyMode(undefined)).toBe('missing')
  })

  test('status never includes the key', () => {
    process.env.STRIPE_SECRET_KEY = 'rk_test_secretvalue'
    const status = control.controlStatus()
    expect(status.keyMode).toBe('restricted')
    expect(status.scopes.map((scope) => scope.resource)).toEqual([
      'Customers', 'Invoices', 'Invoice items', 'Credit notes', 'Meter events',
    ])
    expect(JSON.stringify(status)).not.toContain('secretvalue')
  })
})
