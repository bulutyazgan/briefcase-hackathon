import * as stylex from '@stylexjs/stylex'
import { color, space, text } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  prose: { color: color.ink, fontFamily: text.fontSans, fontSize: text.compact, lineHeight: '21px', maxWidth: '100%', overflowWrap: 'anywhere' },
  paragraph: { marginBlockEnd: space.sm, ':last-child': { marginBlockEnd: '0' } },
  code: { backgroundColor: color.well, borderRadius: '4px', fontFamily: text.fontMono, fontSize: '12px', paddingBlock: '2px', paddingInline: '4px' },
})
