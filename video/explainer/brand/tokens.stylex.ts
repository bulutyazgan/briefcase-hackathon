import * as stylex from '@stylexjs/stylex'

export const color = stylex.defineVars({
  canvas: '#FFFFFF',
  well: '#F4F4F5',
  float: '#FFFFFF',
  ink: '#171717',
  ink2: '#454545',
  ink3: '#737373',
  ink4: '#A1A1AA',
  hairline: 'rgba(23, 23, 23, 0.10)',
  hairlineStrong: 'rgba(23, 23, 23, 0.18)',
  hover: 'rgba(23, 23, 23, 0.04)',
  pressed: 'rgba(23, 23, 23, 0.08)',
  focus: '#52525B',
  positive: '#454545',
  negative: '#454545',
  warning: '#454545',
  white: '#FFFFFF',
})

export const space = stylex.defineVars({
  xxs: '4px',
  xs: '8px',
  sm: '12px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
  xxxl: '64px',
})

export const radius = stylex.defineVars({
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '999px',
  tile: '16px',
  control: '8px',
  pill: '999px',
})

export const text = stylex.defineVars({
  fontSans: '"Geist", Arial, sans-serif',
  fontMono: '"Geist Mono", monospace',
  display: '56px',
  title: '40px',
  heading24: '24px',
  heading20: '20px',
  heading16: '16px',
  lede: '17px',
  body: '15px',
  compact: '14px',
  label: '13px',
  sizeDisplay: '56px',
  sizeTitle: '40px',
  sizeHeading24: '24px',
  sizeHeading20: '20px',
  sizeHeading16: '16px',
  sizeLede: '17px',
  sizeBody: '15px',
  sizeCompact: '14px',
  sizeLabel: '13px',
  lineDisplay: '60px',
  lineTitle: '44px',
  lineHeading24: '32px',
  lineHeading20: '28px',
  lineHeading16: '24px',
  lineLede: '26px',
  lineBody: '24px',
  lineCompact: '20px',
  lineLabel: '20px',
})

export const weight = stylex.defineVars({
  regular: '400',
  medium: '500',
  semibold: '600',
})

export const tracking = stylex.defineVars({
  display: '-0.028em',
  title: '-0.028em',
  heading24: '-0.02em',
  heading20: '-0.015em',
})

export const shadow = stylex.defineVars({
  float: '0 8px 28px rgba(23, 23, 23, 0.08), 0 1px 3px rgba(23, 23, 23, 0.04)',
})
