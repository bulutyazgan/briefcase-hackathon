import * as stylex from '@stylexjs/stylex'
import { color, radius, space, text, weight } from '../../tokens/tokens.stylex'

const pageFade = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

export const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: space.sm, minWidth: 0 },
  toolbar: { alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: space.sm, justifyContent: 'space-between' },
  search: { maxWidth: '360px' },
  wrap: { borderColor: color.hairline, borderRadius: radius.control, borderStyle: 'solid', borderWidth: '1px', maxHeight: '680px', overflow: 'auto' },
  table: { borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%', textAlign: 'start', width: '100%' },
  heading: { backgroundColor: color.well, borderBottomColor: color.hairline, borderBottomStyle: 'solid', borderBottomWidth: '1px', color: color.ink3, fontFamily: text.fontSans, fontSize: text.label, fontWeight: weight.medium, paddingBlock: space.sm, paddingInline: space.md, position: 'sticky', textAlign: 'start', top: 0, zIndex: 1 },
  sortButton: { alignItems: 'center', backgroundColor: 'transparent', borderColor: 'transparent', borderStyle: 'solid', borderWidth: '0px', color: 'inherit', cursor: 'pointer', display: 'inline-flex', fontFamily: text.fontSans, fontSize: text.label, fontWeight: weight.medium, gap: space.xs, padding: 0 },
  alignEnd: { textAlign: 'end' },
  cell: { borderBottomColor: color.hairline, borderBottomStyle: 'solid', borderBottomWidth: '1px', color: color.ink2, fontFamily: text.fontSans, fontSize: text.compact, paddingBlock: space.sm, paddingInline: space.md, transitionDuration: '120ms', transitionProperty: 'background-color, opacity', transitionTimingFunction: 'ease-out', ':hover': { backgroundColor: color.well }, '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0ms' } },
  mono: { fontFamily: text.fontMono, fontVariantNumeric: 'tabular-nums' },
  row: { transitionDuration: '120ms', transitionProperty: 'background-color, opacity', transitionTimingFunction: 'ease-out', ':hover': { backgroundColor: color.well }, '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0ms' } },
  pageFade: { animationDuration: '160ms', animationName: pageFade, animationTimingFunction: 'ease-out', '@media (prefers-reduced-motion: reduce)': { animationDuration: '0ms' } },
  clickable: { cursor: 'pointer', ':focus-visible': { outlineColor: color.focus, outlineOffset: '-2px', outlineStyle: 'solid', outlineWidth: '2px' } },
  skeleton: { backgroundColor: color.well, borderRadius: radius.control, display: 'block', height: '18px', maxWidth: '180px', width: '70%' },
  empty: { alignItems: 'flex-start', backgroundColor: color.well, borderRadius: radius.control, display: 'flex', flexDirection: 'column', gap: space.xs, padding: space.lg },
  clear: { backgroundColor: 'transparent', borderColor: 'transparent', borderStyle: 'solid', borderWidth: '0px', color: color.ink2, cursor: 'pointer', fontFamily: text.fontSans, fontSize: text.compact, padding: 0, textDecoration: 'underline' },
  footer: { alignItems: 'center', display: 'flex', justifyContent: 'space-between', paddingBlock: space.xs },
  pager: { display: 'flex', gap: space.xs },
  pageButton: { alignItems: 'center', backgroundColor: color.canvas, borderColor: color.hairline, borderRadius: radius.control, borderStyle: 'solid', borderWidth: '1px', color: color.ink, cursor: 'pointer', display: 'inline-flex', height: '32px', justifyContent: 'center', width: '32px', ':disabled': { cursor: 'not-allowed', opacity: 0.4 }, ':focus-visible': { outlineColor: color.focus, outlineOffset: '2px', outlineStyle: 'solid', outlineWidth: '2px' } },
})
