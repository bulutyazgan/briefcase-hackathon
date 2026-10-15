import * as stylex from '@stylexjs/stylex'
import { color, text, weight } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  shimmer: { animationDuration: '1.8s', animationIterationCount: 'infinite', animationName: stylex.keyframes({ '0%, 100%': { opacity: 0.46 }, '50%': { opacity: 1 } }), animationTimingFunction: 'ease-in-out', color: color.ink3, fontFamily: text.fontSans, fontSize: text.label, fontWeight: weight.medium, lineHeight: '20px' },
})
