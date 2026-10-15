import { fetchState, type AppState } from './api'

export interface AppSnapshot {
  state: AppState | null
  error: string
}

let snapshot: AppSnapshot = { state: null, error: '' }
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
    snapshot = { state: await fetchState(), error: '' }
  } catch (error) {
    snapshot = { state: snapshot.state, error: String(error) }
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
