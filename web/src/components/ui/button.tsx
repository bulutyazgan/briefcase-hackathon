import * as stylex from '@stylexjs/stylex'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { styles } from './button.stylex'

type Variant = 'primary' | 'secondary' | 'quiet'

export function Button({ children, variant = 'secondary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: Variant }) {
  return <button {...props} {...stylex.props(styles.base, styles[variant])}>{children}</button>
}

export function ButtonLink({ children, variant = 'secondary', ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; variant?: Variant }) {
  return <a {...props} {...stylex.props(styles.base, styles[variant])}>{children}</a>
}
