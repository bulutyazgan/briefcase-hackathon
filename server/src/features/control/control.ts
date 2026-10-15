import { getSetting, markMessageProcessed, recordEvent, setSetting, type ChannelMessage } from '../ledger/store'
import { reply } from '../channels/channel'
import { noteToStaff } from '../staff/staff'

// Policy clause F1 (server/policy/billing-policy.md, "Guardrails"): kill switch.
export const KILL_SWITCH_CLAUSE = 'F1'
const PAUSED_KEY = 'control.paused'

export type KeyMode = 'restricted' | 'secret' | 'missing'

// The documented least-privilege scopes for Tally's restricted Stripe key.
// Everything else (refunds, payouts, charges, payment intents, transfers) is "None".
export const RESTRICTED_KEY_SCOPES = [
  { resource: 'Customers', access: 'write' },
  { resource: 'Invoices', access: 'write' },
  { resource: 'Invoice items', access: 'write' },
  { resource: 'Credit notes', access: 'write' },
  { resource: 'Meter events', access: 'write' },
] as const

export interface ControlStatus {
  paused: boolean
  keyMode: KeyMode
  scopes: { resource: string; access: string }[]
}

export class KillSwitchError extends Error {
  constructor() {
    super('Tally is paused by the kill switch (F1). The account owner must send /resume.')
  }
}

export function detectKeyMode(key: string | undefined): KeyMode {
  if (key?.startsWith('rk_test_')) return 'restricted'
  if (key?.startsWith('sk_test_')) return 'secret'
  return 'missing'
}

export function accountOwners(): string[] {
  return (process.env.ACCOUNT_OWNER ?? 'Account owner')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
}

export function isPaused(): boolean {
  return getSetting(PAUSED_KEY) === 'true'
}

export function assertNotPaused(): void {
  if (isPaused()) throw new KillSwitchError()
}

export function controlStatus(): ControlStatus {
  return {
    paused: isPaused(),
    keyMode: detectKeyMode(process.env.STRIPE_SECRET_KEY),
    scopes: RESTRICTED_KEY_SCOPES.map((scope) => ({ ...scope })),
  }
}

function recordControl(message: ChannelMessage, step: string, summary: string): void {
  recordEvent({
    id: crypto.randomUUID(),
    message_id: message.id,
    step,
    summary,
    data_json: JSON.stringify({ author: message.author, channel: message.channel, text: message.text }),
    policy_clause: KILL_SWITCH_CLAUSE,
  })
}

async function finish(message: ChannelMessage, step: string, summary: string, text: string): Promise<true> {
  recordControl(message, step, summary)
  await reply(message, text)
  markMessageProcessed(message.id)
  return true
}

/**
 * Handles /pause and /resume, and holds every other message while paused.
 * Returns true when the message was consumed and the agent must stop.
 */
export async function handleControlCommand(message: ChannelMessage): Promise<boolean> {
  const command = message.text.trim().toLowerCase()
  if (command === '/pause') {
    setSetting(PAUSED_KEY, 'true')
    void noteToStaff(message.id, 'kill_switch', `Paused: ${message.author} engaged the kill switch, so no invoice, credit note or sourcing spend runs until the account owner sends /resume.`, [KILL_SWITCH_CLAUSE])
    return finish(message, 'kill_switch', `Kill switch engaged by ${message.author}. Billing and sourcing stopped.`,
      'Tally is paused (F1 kill switch). No billing or sourcing until the account owner sends /resume.')
  }
  if (command === '/resume') {
    if (!accountOwners().includes(message.author.trim().toLowerCase())) {
      return finish(message, 'kill_switch', `Ignored /resume from ${message.author}: not the account owner.`,
        'Only the account owner can resume Tally. It stays paused.')
    }
    setSetting(PAUSED_KEY, 'false')
    void noteToStaff(message.id, 'kill_switch', `Resumed: account owner ${message.author} lifted the kill switch; billing and sourcing are active again.`, [KILL_SWITCH_CLAUSE])
    return finish(message, 'kill_switch', `Account owner ${message.author} resumed Tally.`,
      'Tally resumed by the account owner. Billing and sourcing are active again.')
  }
  if (!isPaused()) return false
  return finish(message, 'kill_switch_blocked', 'Kill switch is on: message not sourced or billed.',
    'Tally is paused (F1 kill switch), so this request was not sourced or billed. Resend it after /resume.')
}

/** Guard for the billing path (e.g. approvals): records an F1 audit event and replies when paused. */
export async function blockIfPaused(message: ChannelMessage): Promise<boolean> {
  try {
    assertNotPaused()
    return false
  } catch (error) {
    if (!(error instanceof KillSwitchError)) throw error
    recordControl(message, 'kill_switch_blocked', 'Kill switch is on: billing stopped before calling Stripe.')
    await reply(message, `Billing stopped: ${error.message}`)
    return true
  }
}
