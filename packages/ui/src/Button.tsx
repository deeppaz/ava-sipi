import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx.js'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'solid' | 'quiet'
  size?: 'sm' | 'md'
  icon?: ReactNode
}

/** Glass button. Variants stay inside the tide/current/foam shell palette (spec §6.1). */
export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('as-btn', `as-btn--${variant}`, `as-btn--${size}`, className)}
      {...rest}
    >
      {icon ? <span className="as-btn__icon">{icon}</span> : null}
      {children ? <span>{children}</span> : null}
    </button>
  )
}
