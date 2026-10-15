import * as stylex from '@stylexjs/stylex'
import { color, radius, space, text, weight } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  details: { borderColor: color.hairline, borderRadius: radius.control, borderStyle: 'solid', borderWidth: '1px', paddingBlock: space.xs, paddingInline: space.sm },
  summary: { color: color.ink3, cursor: 'pointer', fontFamily: text.fontSans, fontSize: text.label, fontWeight: weight.medium, lineHeight: '20px', listStyle: 'none', '::-webkit-details-marker': { display: 'none' } },
  list: { display: 'flex', flexDirection: 'column', gap: space.sm, marginBlockStart: space.sm, paddingInlineStart: space.lg },
  step: { color: color.ink2, fontFamily: text.fontSans, fontSize: text.label, lineHeight: '20px' },
  stepName: { color: color.ink, fontWeight: weight.medium },
})
