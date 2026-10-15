import type { Transition } from 'motion/react'

export const spring = {
  fast: { type: 'spring', duration: 0.08, bounce: 0 },
  moderate: { type: 'spring', duration: 0.16, bounce: 0 },
  slow: { type: 'spring', duration: 0.24, bounce: 0.12 },
} as const satisfies Record<string, Transition>

export const exitTween = {
  fast: { type: 'tween', duration: 0.06, ease: 'easeOut' },
  moderate: { type: 'tween', duration: 0.1, ease: 'easeOut' },
  slow: { type: 'tween', duration: 0.16, ease: 'easeOut' },
} as const satisfies Record<string, Transition>

export const skeletonTiming = {
  showAfterMs: 120,
  minVisibleMs: 380,
} as const
