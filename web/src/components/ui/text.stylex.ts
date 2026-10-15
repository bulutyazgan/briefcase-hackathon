import * as stylex from '@stylexjs/stylex'
import { color, text, tracking, weight } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  display: { color: color.ink, fontFamily: text.fontSans, fontSize: text.display, fontWeight: weight.regular, letterSpacing: tracking.display, lineHeight: text.lineDisplay, margin: 0 },
  title: { color: color.ink, fontFamily: text.fontSans, fontSize: text.title, fontWeight: weight.regular, letterSpacing: tracking.title, lineHeight: text.lineTitle, margin: 0 },
  heading24: { color: color.ink, fontFamily: text.fontSans, fontSize: text.heading24, fontWeight: weight.medium, letterSpacing: tracking.heading24, lineHeight: text.lineHeading24, margin: 0 },
  heading20: { color: color.ink, fontFamily: text.fontSans, fontSize: text.heading20, fontWeight: weight.medium, letterSpacing: tracking.heading20, lineHeight: text.lineHeading20, margin: 0 },
  heading16: { color: color.ink, fontFamily: text.fontSans, fontSize: text.heading16, fontWeight: weight.medium, lineHeight: text.lineHeading16, margin: 0 },
  lede: { color: color.ink2, fontFamily: text.fontSans, fontSize: text.lede, fontWeight: weight.regular, lineHeight: text.lineLede, margin: 0, maxWidth: '680px' },
  body: { color: color.ink2, fontFamily: text.fontSans, fontSize: text.body, fontWeight: weight.regular, lineHeight: text.lineBody, margin: 0 },
  compact: { color: color.ink2, fontFamily: text.fontSans, fontSize: text.compact, fontWeight: weight.regular, lineHeight: text.lineCompact, margin: 0 },
  label: { color: color.ink3, fontFamily: text.fontSans, fontSize: text.label, fontWeight: weight.medium, lineHeight: text.lineLabel, margin: 0 },
  mono: { color: color.ink, fontFamily: text.fontMono, fontSize: text.compact, fontWeight: weight.regular, fontVariantNumeric: 'tabular-nums', lineHeight: text.lineCompact, margin: 0 },
})
