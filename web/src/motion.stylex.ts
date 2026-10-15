import * as stylex from '@stylexjs/stylex'
import { color } from './tokens/tokens.stylex'

// Strong curves: entrances and feedback ease out, on-screen movement eases in-out.
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'

const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

const enterUp = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
})

const enterScale = stylex.keyframes({
  from: { opacity: 0, transform: 'scale(0.98)' },
  to: { opacity: 1, transform: 'scale(1)' },
})

const enterFromRight = stylex.keyframes({
  from: { opacity: 0, transform: 'translateX(6px)' },
  to: { opacity: 1, transform: 'translateX(0)' },
})

const enterFromLeft = stylex.keyframes({
  from: { opacity: 0, transform: 'translateX(-6px)' },
  to: { opacity: 1, transform: 'translateX(0)' },
})

// One frame of focus ring, released over 600 ms so the eye lands on the reply.
const highlight = stylex.keyframes({
  from: { boxShadow: `0 0 0 2px ${color.focus}` },
  to: { boxShadow: '0 0 0 2px transparent' },
})

const pulse = stylex.keyframes({
  '0%': { transform: 'scale(1)' },
  '40%': { transform: 'scale(1.03)' },
  '100%': { transform: 'scale(1)' },
})

const blurIn = stylex.keyframes({
  from: { opacity: 0, filter: 'blur(4px)' },
  to: { opacity: 1, filter: 'blur(0)' },
})

export const motion = stylex.create({
  // Lists: a row that just arrived rises 6px into place.
  enterUp: {
    animationName: { default: enterUp, '@media (prefers-reduced-motion: reduce)': fadeIn },
    animationDuration: '220ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'both',
  },
  // An agent reply: the same rise plus a ring that fades.
  enterUpHighlighted: {
    animationName: { default: `${enterUp}, ${highlight}`, '@media (prefers-reduced-motion: reduce)': `${fadeIn}, ${highlight}` },
    animationDuration: '220ms, 600ms',
    animationTimingFunction: `${EASE_OUT}, ${EASE_OUT}`,
    animationFillMode: 'both, both',
  },
  // Cards grow from where they will sit; never from nothing.
  enterScale: {
    animationName: { default: enterScale, '@media (prefers-reduced-motion: reduce)': fadeIn },
    animationDuration: '240ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'both',
  },
  pageForward: {
    animationName: { default: enterFromRight, '@media (prefers-reduced-motion: reduce)': fadeIn },
    animationDuration: '180ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'both',
  },
  pageBack: {
    animationName: { default: enterFromLeft, '@media (prefers-reduced-motion: reduce)': fadeIn },
    animationDuration: '180ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'both',
  },
  pulse: {
    animationName: { default: pulse, '@media (prefers-reduced-motion: reduce)': 'none' },
    animationDuration: '240ms',
    animationTimingFunction: EASE_IN_OUT,
  },
  blurIn: {
    animationName: { default: blurIn, '@media (prefers-reduced-motion: reduce)': fadeIn },
    animationDuration: '300ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'both',
  },
  stagger: (index: number) => ({ animationDelay: `${index * 40}ms` }),
  staggerTight: (index: number) => ({ animationDelay: `${index * 30}ms` }),
  // Pressables answer on pointer-down with a settle; the hover lift only exists for a real pointer.
  pressable: {
    transitionProperty: 'transform, background-color, color, border-color, opacity',
    transitionDuration: { default: '140ms', '@media (prefers-reduced-motion: reduce)': '0ms' },
    transitionTimingFunction: EASE_OUT,
    transform: {
      default: 'none',
      '@media (hover: hover) and (pointer: fine)': { default: 'none', ':hover': 'translateY(-1px)' },
      ':active': 'scale(0.97)',
      ':disabled': 'none',
    },
  },
  // Colour cross-fade for a status change.
  tinted: {
    transitionProperty: 'background-color, color',
    transitionDuration: { default: '200ms', '@media (prefers-reduced-motion: reduce)': '0ms' },
    transitionTimingFunction: 'ease',
  },
  // Collapse wrapper with a known ceiling so the list below never jumps; exits are faster than entrances.
  collapsible: {
    maxHeight: '320px',
    overflow: 'hidden',
    transitionProperty: 'max-height, opacity, transform',
    transitionDuration: { default: '180ms', '@media (prefers-reduced-motion: reduce)': '0ms' },
    transitionTimingFunction: EASE_OUT,
  },
  collapsed: {
    maxHeight: '0px',
    opacity: 0,
    transform: 'scale(0.98)',
    pointerEvents: 'none',
  },
  // Moves between nav items; transform only.
  slide: {
    transitionProperty: 'transform',
    transitionDuration: { default: '200ms', '@media (prefers-reduced-motion: reduce)': '0ms' },
    transitionTimingFunction: EASE_IN_OUT,
  },
})
