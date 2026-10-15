import * as stylex from '@stylexjs/stylex'
import { tokens } from '../../tokens/tokens.stylex'

export const styles = stylex.create({
  panel: {
    minWidth: 0,
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
    overflow: 'hidden',
  },
  header: {
    paddingBlock: tokens.space4,
    paddingInline: tokens.space4,
    borderBottomColor: tokens.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  title: {
    color: tokens.ink,
    fontSize: tokens.textHeading,
    fontWeight: tokens.weightBold,
    marginBlockStart: 0,
    marginBlockEnd: 0,
  },
  subtitle: { color: tokens.muted, fontSize: tokens.textSmall, marginTop: tokens.space1 },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: { default: '460px', '@media (max-width: 700px)': '380px' },
    overflowY: 'auto',
    paddingBlock: tokens.space2,
    paddingInline: tokens.space4,
  },
  event: {
    display: 'grid',
    gridTemplateColumns: 'minmax(62px, 0.3fr) minmax(0, 1fr)',
    gap: tokens.space3,
    paddingBlock: tokens.space3,
    borderBottomColor: tokens.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  time: { color: tokens.muted, fontSize: tokens.textSmall },
  name: {
    color: tokens.ink,
    fontSize: tokens.textBody,
    fontWeight: tokens.weightBold,
    textTransform: 'capitalize',
  },
  summary: {
    color: tokens.muted,
    fontSize: tokens.textSmall,
    lineHeight: tokens.textLine,
    marginTop: tokens.space1,
    overflowWrap: 'anywhere',
  },
  clauseList: { color: tokens.accent, fontSize: tokens.textSmall, marginTop: tokens.space1 },
  empty: {
    color: tokens.muted,
    fontSize: tokens.textBody,
    paddingBlock: tokens.space5,
    paddingInline: tokens.space4,
  },
})
