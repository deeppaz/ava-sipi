import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx.js'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  active?: boolean
}

/** Square icon-only button; `label` becomes the accessible name and tooltip. */
export function IconButton({
  label,
  children,
  active,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx('as-iconbtn', active && 'is-active', className)}
      {...rest}
    >
      {children}
    </button>
  )
}
