import * as stylex from '@stylexjs/stylex'
import { color, radius, shadow, space, text, weight } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  viewport: { backgroundColor: color.canvas, boxSizing: 'border-box', display: 'grid', gap: space.md, gridTemplateColumns: '12rem minmax(0, 1fr)', height: '100dvh', overflow: 'hidden', padding: space.md, width: '100%', '@media (max-width: 767px)': { display: 'flex', flexDirection: 'column', gap: space.sm, height: '100dvh', padding: space.xs } },
  sidebar: { backgroundColor: color.float, borderColor: color.hairline, borderRadius: radius.tile, borderStyle: 'solid', borderWidth: '1px', boxShadow: shadow.float, display: 'flex', flexDirection: 'column', minHeight: 0, padding: space.md, '@media (max-width: 767px)': { flex: 'none', padding: space.sm } },
  content: { backgroundColor: color.canvas, borderColor: color.hairline, borderRadius: radius.tile, borderStyle: 'solid', borderWidth: '1px', minHeight: 0, minWidth: 0, overflow: 'auto', padding: space.lg, '@media (max-width: 767px)': { padding: space.sm } },
  brand: { alignItems: 'center', color: color.ink, display: 'flex', fontFamily: text.fontSans, fontSize: '16px', fontWeight: weight.medium, gap: space.sm, paddingBlock: space.sm, paddingInline: space.xs, textDecoration: 'none' },
  nav: { display: 'flex', flexDirection: 'column', gap: '2px', marginBlockStart: space.lg, '@media (max-width: 767px)': { flexDirection: 'row', marginBlockStart: space.xs, overflowX: 'auto' } },
  navLink: { alignItems: 'center', borderColor: 'transparent', borderRadius: radius.control, borderStyle: 'solid', borderWidth: '1px', color: color.ink2, display: 'flex', fontFamily: text.fontSans, fontSize: text.compact, gap: space.sm, justifyContent: 'space-between', minHeight: '36px', paddingBlock: space.xs, paddingInline: space.sm, textDecoration: 'none', transitionDuration: '100ms', transitionProperty: 'background-color, color', ':hover': { backgroundColor: color.hover, color: color.ink }, ':focus-visible': { outlineColor: color.focus, outlineOffset: '2px', outlineStyle: 'solid', outlineWidth: '2px' }, '@media (max-width: 767px)': { minWidth: 'fit-content' } },
  active: { backgroundColor: color.well, borderColor: color.hairlineStrong, color: color.ink, fontWeight: '500' },
  badge: { alignItems: 'center', backgroundColor: color.well, borderRadius: radius.full, color: color.ink3, display: 'inline-flex', fontFamily: text.fontMono, fontSize: text.label, justifyContent: 'center', minHeight: '20px', minWidth: '20px', paddingInline: '5px' },
  footer: { borderTopColor: color.hairline, borderTopStyle: 'solid', borderTopWidth: '1px', display: 'flex', flexDirection: 'column', gap: space.sm, marginBlockStart: 'auto', paddingBlockStart: space.md, '@media (max-width: 767px)': { display: 'none' } },
  mode: { alignItems: 'center', backgroundColor: color.well, borderRadius: radius.full, color: color.ink2, display: 'inline-flex', fontFamily: text.fontSans, fontSize: text.label, gap: space.xs, paddingBlock: space.xs, paddingInline: space.sm, width: 'fit-content' },
  modeDot: { backgroundColor: color.ink3, borderRadius: '50%', height: '6px', width: '6px' },
  back: { color: color.ink3, fontFamily: text.fontSans, fontSize: text.compact, paddingBlock: space.xs, paddingInline: space.xs, textDecoration: 'none', ':hover': { color: color.ink } },
})
