import * as stylex from '@stylexjs/stylex'
import { color, radius, space, text, weight } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  base: {
    alignItems: 'center', borderColor: 'transparent', borderRadius: radius.full, borderStyle: 'solid', borderWidth: '1px', cursor: 'pointer',
    display: 'inline-flex', fontFamily: text.fontSans, fontSize: text.compact, fontWeight: weight.medium, gap: space.xs, justifyContent: 'center',
    minHeight: '36px', paddingBlock: '7px', paddingInline: space.md, textDecoration: 'none',
    transitionDuration: '120ms', transitionProperty: 'background-color, color, border-color, transform', transitionTimingFunction: 'ease-out',
    ':hover': { transform: 'translateY(-1px)' }, ':active': { transform: 'translateY(1px)' },
    ':focus-visible': { outlineColor: color.focus, outlineOffset: '3px', outlineStyle: 'solid', outlineWidth: '2px' },
    ':disabled': { cursor: 'not-allowed', opacity: 0.48 },
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0ms', ':hover': { transform: 'none' }, ':active': { transform: 'none' } },
  },
  primary: { backgroundColor: color.ink, color: color.white, ':hover': { backgroundColor: color.ink2 } },
  secondary: { backgroundColor: color.canvas, borderColor: color.hairlineStrong, color: color.ink, ':hover': { backgroundColor: color.well } },
  quiet: { backgroundColor: 'transparent', color: color.ink2, ':hover': { backgroundColor: color.hover } },
})
