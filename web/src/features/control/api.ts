export type KeyMode = 'restricted' | 'secret' | 'missing'

export interface ControlScope {
  resource: string
  access: string
}

export interface ControlStatus {
  paused: boolean
  keyMode: KeyMode
  scopes: ControlScope[]
  readOnly: boolean
}

interface ControlStatusPayload {
  paused: boolean
  keyMode: KeyMode
  scopes: ControlScope[]
  readOnly?: boolean
}

function isKeyMode(value: unknown): value is KeyMode {
  return value === 'restricted' || value === 'secret' || value === 'missing'
}

function isScope(value: unknown): value is ControlScope {
  return typeof value === 'object' && value !== null
    && 'resource' in value && typeof value.resource === 'string'
    && 'access' in value && typeof value.access === 'string'
}

function isControlStatus(value: unknown): value is ControlStatusPayload {
  return typeof value === 'object' && value !== null
    && 'paused' in value && typeof value.paused === 'boolean'
    && 'keyMode' in value && isKeyMode(value.keyMode)
    && 'scopes' in value && Array.isArray(value.scopes) && value.scopes.every(isScope)
    && (!('readOnly' in value) || typeof value.readOnly === 'boolean')
}

export async function fetchControlStatus(): Promise<ControlStatus> {
  const response = await fetch('/api/control')
  if (!response.ok) throw new Error(`Control request failed (${response.status}).`)
  const payload: unknown = await response.json()
  if (!isControlStatus(payload)) throw new Error('The server returned an invalid control response.')
  return { paused: payload.paused, keyMode: payload.keyMode, scopes: payload.scopes, readOnly: payload.readOnly ?? false }
}

export const keyModeLabel: Record<KeyMode, string> = {
  restricted: 'Restricted key (rk_test_)',
  secret: 'Full secret key (sk_test_) — switch to restricted',
  missing: 'No Stripe test key',
}
