import * as stylex from '@stylexjs/stylex'
import { color, space, text, weight } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  list: { alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: space.xs, marginBlockStart: space.xs },
  link: { color: color.ink2, fontFamily: text.fontSans, fontSize: text.label, fontWeight: weight.medium, textDecorationLine: 'underline', textDecorationColor: color.hairlineStrong, textUnderlineOffset: '3px', ':hover': { color: color.ink }, ':focus-visible': { outlineColor: color.focus, outlineOffset: '2px', outlineStyle: 'solid', outlineWidth: '2px' } },
})
