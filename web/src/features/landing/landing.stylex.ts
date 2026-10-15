import * as stylex from '@stylexjs/stylex'
import { color, radius, shadow, space, text, weight } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  demoBackdrop: { alignItems: 'center', backgroundColor: 'rgba(23, 23, 23, 0.72)', display: 'flex', inset: 0, justifyContent: 'center', padding: space.lg, position: 'fixed', zIndex: 50 },
  demoDialog: { backgroundColor: color.canvas, borderRadius: radius.tile, boxShadow: shadow.float, display: 'flex', flexDirection: 'column', gap: space.sm, maxWidth: '1120px', padding: space.md, width: '100%' },
  demoHeader: { alignItems: 'center', display: 'flex', justifyContent: 'space-between' },
  demoVideo: { aspectRatio: '16 / 10', backgroundColor: color.well, borderRadius: radius.control, display: 'block', width: '100%' },
  root: { backgroundColor: color.canvas, minHeight: '100dvh', paddingBlock: space.md, paddingInline: space.lg, '@media (max-width: 700px)': { paddingInline: space.xs } },
  nav: { alignItems: 'center', display: 'flex', justifyContent: 'space-between', marginInline: 'auto', maxWidth: '1200px', paddingBlock: space.md, paddingInline: space.xs },
  brand: { alignItems: 'center', color: color.ink, display: 'inline-flex', fontFamily: text.fontSans, fontSize: text.compact, fontWeight: weight.medium, gap: space.sm, textDecoration: 'none' },
  links: { alignItems: 'center', display: 'flex', gap: space.lg, '@media (max-width: 520px)': { gap: space.sm } },
  navLink: { color: color.ink2, fontFamily: text.fontSans, fontSize: text.compact, textDecoration: 'none', ':hover': { color: color.ink } },
  content: { marginInline: 'auto', maxWidth: '1200px' },
  hero: { alignItems: 'end', backgroundColor: color.well, borderRadius: radius.tile, display: 'grid', gap: space.xl, gridTemplateColumns: '1.15fr 0.85fr', padding: space.xl, '@media (max-width: 900px)': { gridTemplateColumns: '1fr' }, '@media (max-width: 560px)': { padding: space.md } },
  heroCard: { backgroundColor: color.canvas, borderColor: color.hairline, borderRadius: radius.tile, borderStyle: 'solid', borderWidth: '1px', display: 'flex', flexDirection: 'column', gap: space.md, padding: space.lg },
  message: { backgroundColor: color.well, borderRadius: radius.control, color: color.ink2, fontFamily: text.fontSans, fontSize: text.compact, lineHeight: '22px', padding: space.md },
  reply: { backgroundColor: color.canvas, borderColor: color.hairline, borderRadius: radius.control, borderStyle: 'solid', borderWidth: '1px', color: color.ink, fontFamily: text.fontSans, fontSize: text.compact, lineHeight: '22px', padding: space.md },
  label: { color: color.ink3, fontFamily: text.fontSans, fontSize: text.label, fontWeight: weight.medium },
  steps: { display: 'grid', gap: space.md, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', '@media (max-width: 900px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, '@media (max-width: 560px)': { gridTemplateColumns: '1fr' } },
  step: { backgroundColor: color.well, borderRadius: radius.tile, display: 'flex', flexDirection: 'column', gap: space.sm, minHeight: '170px', padding: space.lg },
  stepNumber: { color: color.ink3, fontFamily: text.fontMono, fontSize: text.label },
  evidence: { display: 'grid', gap: space.sm, gridTemplateColumns: '100px minmax(0, 1fr)', paddingBlock: space.sm, borderBottomColor: color.hairline, borderBottomStyle: 'solid', borderBottomWidth: '1px', '@media (max-width: 520px)': { gridTemplateColumns: '1fr' } },
  policyGrid: { display: 'grid', gap: space.xs, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', '@media (max-width: 700px)': { gridTemplateColumns: '1fr' } },
  policyItem: { alignItems: 'flex-start', backgroundColor: color.well, borderRadius: radius.control, display: 'flex', gap: space.sm, padding: space.md },
  money: { color: color.ink, fontFamily: text.fontMono, fontSize: text.compact, fontVariantNumeric: 'tabular-nums' },
})
