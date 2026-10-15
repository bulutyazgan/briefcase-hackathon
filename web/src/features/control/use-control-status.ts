import { useEffect, useState } from 'react'
import { fetchControlStatus, type ControlStatus } from './api'

export interface ControlSnapshot {
  status: ControlStatus | null
  error: string
  loaded: boolean
}

export function useControlStatus(intervalMs = 3000): ControlSnapshot {
  const [snapshot, setSnapshot] = useState<ControlSnapshot>({ status: null, error: '', loaded: false })

  useEffect(() => {
    let alive = true
    const load = () => {
      fetchControlStatus()
        .then((status) => { if (alive) setSnapshot({ status, error: '', loaded: true }) })
        .catch((reason: unknown) => { if (alive) setSnapshot((previous) => ({ status: previous.status, error: String(reason), loaded: true })) })
    }
    load()
    const timer = setInterval(load, intervalMs)
    return () => { alive = false; clearInterval(timer) }
  }, [intervalMs])

  return snapshot
}
