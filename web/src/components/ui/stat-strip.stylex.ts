import * as stylex from '@stylexjs/stylex'
import { color, radius, space, text, weight } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  strip: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderColor: color.hairline, borderStyle: 'solid', borderWidth: '1px', borderRadius: radius.tile, overflow: 'hidden' },
  item: { backgroundColor: color.canvas, display: 'flex', flexDirection: 'column', gap: space.xs, minHeight: '88px', paddingBlock: space.md, paddingInline: space.lg, ':not(:last-child)': { borderInlineEndColor: color.hairline, borderInlineEndStyle: 'solid', borderInlineEndWidth: '1px' } },
  value: { color: color.ink, fontFamily: text.fontSans, fontSize: text.heading20, fontWeight: weight.medium, lineHeight: '28px', overflowWrap: 'anywhere' },
  mono: { fontFamily: text.fontMono, fontVariantNumeric: 'tabular-nums' },
  label: { color: color.ink3, fontFamily: text.fontSans, fontSize: text.label, fontWeight: weight.medium, lineHeight: '20px' },
})
