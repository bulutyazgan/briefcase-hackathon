import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, motion } from 'motion/react'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { color, space } from '../../tokens/tokens.stylex'
import { spring, skeletonTiming } from '../../motion/springs'
import { styles } from './skeleton.stylex'

type SwapState = 'content' | 'delay' | 'skeleton'
let currentState: SwapState = 'content'
let currentlyLoading = false
let visibleAt = 0
let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return currentState
}

function setLoading(loading: boolean) {
  if (loading === currentlyLoading) return
  currentlyLoading = loading
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  if (loading) {
    currentState = 'delay'
    showTimer = setTimeout(() => {
      if (!currentlyLoading) return
      currentState = 'skeleton'
      visibleAt = Date.now()
      notify()
    }, skeletonTiming.showAfterMs)
  } else if (currentState === 'skeleton') {
    const remaining = Math.max(0, skeletonTiming.minVisibleMs - (Date.now() - visibleAt))
    hideTimer = setTimeout(() => {
      currentState = 'content'
      notify()
    }, remaining)
  } else {
    currentState = 'content'
  }
}

export function useSkeletonSwap(loading: boolean) {
  setLoading(loading)
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const keyframes = {
  initial: { opacity: 0, filter: 'blur(6px)' },
  animate: { opacity: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, filter: 'blur(6px)' },
}

export function SkeletonBar({ width = 'full', height = 'text' }: { width?: 'xs' | 'sm' | 'md' | 'lg' | 'full'; height?: 'text' | 'control' | 'tile' }) {
  return <motion.span aria-hidden {...stylex.props(styles.bar, styles[width], styles[height])} />
}

export function SkeletonSwap({ loading, skeleton, children }: { loading: boolean; skeleton: ReactNode; children: ReactNode }) {
  const state = useSkeletonSwap(loading)
  if (state === 'delay') return <div {...stylex.props(styles.swap, styles.hidden)} aria-hidden>{skeleton}</div>
  return (
    <div {...stylex.props(styles.swap)}>
      <AnimatePresence mode="wait" initial={false}>
        {state === 'skeleton'
          ? <motion.div key="skeleton" initial={keyframes.initial} animate={keyframes.animate} exit={keyframes.exit} transition={spring.moderate} aria-label="Loading page">{skeleton}</motion.div>
          : <motion.div key="content" initial={keyframes.initial} animate={keyframes.animate} exit={keyframes.exit} transition={spring.moderate}>{children}</motion.div>}
      </AnimatePresence>
    </div>
  )
}
