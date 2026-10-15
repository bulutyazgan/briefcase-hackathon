import type { Sourcer } from './sourcing'

// Tries each sourcer in order; a sourcer that throws (no Treg token, provider outage) hands over to the next.
export function withFallback(primary: Sourcer, fallback: Sourcer): Sourcer {
  return async (request) => {
    try {
      return await primary(request)
    } catch (error) {
      console.warn(`Primary sourcer failed, falling back: ${String(error)}`)
      return fallback(request)
    }
  }
}
