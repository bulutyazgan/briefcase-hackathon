import { useEffect } from 'react'

// Rows that have already been shown once, per list. Polling replaces the whole
// app state every second, so entrances must key off this and not off render.
const seenByScope = new Map<string, Set<string>>()

const MAX_STAGGER_INDEX = 10

/**
 * Returns, for every id not yet seen in this scope, its position among the
 * new ids (0, 1, 2…) so the caller can stagger entrances. After the render
 * commits, all ids are marked seen, so a re-render or a poll never animates
 * the same row twice.
 */
export function useFreshIds(scope: string, ids: readonly string[]): Map<string, number> {
  const seen = seenByScope.get(scope) ?? new Set<string>()
  const fresh = new Map<string, number>()
  for (const id of ids) {
    if (!seen.has(id)) fresh.set(id, Math.min(fresh.size, MAX_STAGGER_INDEX))
  }

  useEffect(() => {
    const set = seenByScope.get(scope) ?? new Set<string>()
    for (const id of ids) set.add(id)
    seenByScope.set(scope, set)
  })

  return fresh
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Previous value per key, so a change (open → paid) can be told from a first render. */
const lastValueByKey = new Map<string, string>()

export function useValueChanged(key: string, value: string): boolean {
  const previous = lastValueByKey.get(key)
  const changed = previous !== undefined && previous !== value
  useEffect(() => {
    lastValueByKey.set(key, value)
  }, [key, value])
  return changed
}
