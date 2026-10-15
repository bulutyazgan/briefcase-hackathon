import type { Sourcer } from './sourcing'

// Tries each sourcer in order. The primary hands over when it throws (no Treg token, provider outage)
// or when it buys nothing (a query the provider cannot match); spend it already made stays on the record.
export function withFallback(primary: Sourcer, fallback: Sourcer): Sourcer {
  return async (request) => {
    try {
      const result = await primary(request)
      if (result.leads.length > 0) return result
      console.warn(`Primary sourcer bought 0 leads (${result.costMicro} micro-USD spent), falling back.`)
      const next = await fallback(request)
      return { ...next, calls: [...result.calls, ...next.calls], costMicro: result.costMicro + next.costMicro }
    } catch (error) {
      console.warn(`Primary sourcer failed, falling back: ${String(error)}`)
      return fallback(request)
    }
  }
}
