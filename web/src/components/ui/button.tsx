import * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { styles } from './button.stylex'

type Variant = 'primary' | 'secondary' | 'quiet'

export function Button({ children, variant = 'secondary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: Variant }) {
  return <button {...props} {...stylex.props(styles.base, styles[variant])}>{children}</button>
}
