import * as stylex from '@stylexjs/stylex'
import { color, radius, space } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  list: { display: 'flex', flexDirection: 'column', gap: '2px', position: 'relative' },
  item: { borderRadius: radius.control, display: 'flex', minWidth: 0, paddingBlock: space.md, paddingInline: space.md, position: 'relative', zIndex: 1 },
  highlight: { backgroundColor: color.well, borderRadius: radius.control, inset: 0, position: 'absolute', zIndex: -1 },
  separator: { borderBottomColor: color.hairline, borderBottomStyle: 'solid', borderBottomWidth: '1px' },
})
