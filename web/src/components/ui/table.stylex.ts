import * as stylex from '@stylexjs/stylex'
import { color, radius, space, text, weight } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  wrap: { borderColor: color.hairline, borderRadius: radius.tile, borderStyle: 'solid', borderWidth: '1px', overflowX: 'auto' },
  table: { borderCollapse: 'collapse', minWidth: '620px', textAlign: 'left', width: '100%' },
  head: { backgroundColor: color.well, color: color.ink3, fontFamily: text.fontSans, fontSize: text.label, fontWeight: weight.medium },
  heading: { paddingBlock: space.sm, paddingInline: space.md, whiteSpace: 'nowrap' },
  cell: { borderTopColor: color.hairline, borderTopStyle: 'solid', borderTopWidth: '1px', color: color.ink2, fontFamily: text.fontSans, fontSize: text.compact, lineHeight: '20px', paddingBlock: space.md, paddingInline: space.md, verticalAlign: 'middle' },
  mono: { fontFamily: text.fontMono, fontVariantNumeric: 'tabular-nums' },
})
