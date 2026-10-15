import * as stylex from '@stylexjs/stylex'
import { color, space } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  page: {
    backgroundColor: color.canvas, borderColor: color.hairline, borderRadius: '20px', borderStyle: 'solid', borderWidth: '1px',
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: space.xl, minHeight: '100%', paddingBlock: space.xxl, paddingInline: space.xxl, width: '100%',
    '@media (max-width: 720px)': { borderRadius: '0', borderWidth: '0', paddingBlock: space.lg, paddingInline: space.md },
  },
  opening: { alignItems: 'flex-end', display: 'flex', gap: space.lg, justifyContent: 'space-between', width: '100%', '@media (max-width: 720px)': { alignItems: 'flex-start', flexDirection: 'column' } },
  openingCopy: { display: 'flex', flexDirection: 'column', gap: space.xs, minWidth: 0 },
  openingTools: { alignItems: 'center', display: 'flex', flexShrink: 0, flexWrap: 'wrap', gap: space.xs },
  section: { display: 'flex', flexDirection: 'column', gap: space.md, minWidth: 0 },
  sectionHeader: { alignItems: 'flex-end', display: 'flex', justifyContent: 'space-between', gap: space.md },
  closing: { borderTopColor: color.hairline, borderTopStyle: 'solid', borderTopWidth: '1px', paddingBlockStart: space.lg },
  grid: { display: 'grid', gap: space.lg, gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' },
})
