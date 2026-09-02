import type { ReactNode } from 'react'
import { cx } from './cx.js'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

/** CSS-only tooltip: visible on hover and keyboard focus, no JS positioning. */
export function Tooltip({ content, children, side = 'right', className }: TooltipProps) {
  return (
    <span className={cx('as-tooltip', `as-tooltip--${side}`, className)}>
      {children}
      <span role="tooltip" className="as-tooltip__bubble">
        {content}
      </span>
    </span>
  )
}
