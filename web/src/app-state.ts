import { fetchLeads, fetchState, type AppState, type SourcedLead } from './api'

export interface AppSnapshot {
  state: AppState | null
  leads: SourcedLead[] | null
  error: string
  leadsError: string
}

let snapshot: AppSnapshot = { state: null, leads: null, error: '', leadsError: '' }
let timer: number | null = null
let requestActive = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export async function refreshState(): Promise<void> {
  if (!listeners.size || requestActive) return
  requestActive = true
  try {
    const [stateResult, leadsResult] = await Promise.allSettled([fetchState(), fetchLeads()])
    snapshot = {
      state: stateResult.status === 'fulfilled' ? stateResult.value : snapshot.state,
      leads: leadsResult.status === 'fulfilled' ? leadsResult.value : snapshot.leads,
      error: stateResult.status === 'rejected' ? String(stateResult.reason) : '',
      leadsError: leadsResult.status === 'rejected' ? String(leadsResult.reason) : '',
    }
  } catch {
    snapshot = { ...snapshot, error: 'Unable to refresh application data.' }
  } finally {
    requestActive = false
    notify()
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    void refreshState()
    timer = window.setInterval(() => void refreshState(), 1000)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size && timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }
}

export function getSnapshot(): AppSnapshot {
  return snapshot
}
