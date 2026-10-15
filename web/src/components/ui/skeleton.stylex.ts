import * as stylex from '@stylexjs/stylex'
import { color, radius, space } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  bar: { animationDuration: '1.4s', animationIterationCount: 'infinite', animationName: stylex.keyframes({ '0%, 100%': { opacity: 0.5 }, '50%': { opacity: 0.9 } }), animationTimingFunction: 'ease-in-out', backgroundColor: color.well, borderRadius: radius.sm, display: 'block' },
  xs: { width: '52px' },
  sm: { width: '96px' },
  md: { width: '160px' },
  lg: { width: '280px' },
  full: { width: '100%' },
  text: { height: '16px' },
  control: { height: '40px' },
  tile: { height: '120px' },
  page: { display: 'flex', flexDirection: 'column', gap: space.xl, minHeight: '360px' },
  swap: { minHeight: '360px', width: '100%' },
  hidden: { opacity: 0, visibility: 'hidden' },
  section: { display: 'flex', flexDirection: 'column', gap: space.md },
  stack: { display: 'flex', flexDirection: 'column', gap: space.sm },
  grid: { display: 'grid', gap: space.md, gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' },
  panel: { backgroundColor: color.well, borderRadius: radius.tile, minHeight: '220px', gridColumn: 'span 8' },
  sidePanel: { backgroundColor: color.well, borderRadius: radius.tile, minHeight: '220px', gridColumn: 'span 4' },
})
