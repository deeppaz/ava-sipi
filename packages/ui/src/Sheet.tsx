import { type ReactNode, useEffect, useRef } from 'react'
import { cx } from './cx.js'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  side?: 'right' | 'bottom'
  className?: string
  /** Element id whose text labels the dialog. */
  labelledBy?: string
}

/**
 * Non-modal glass sheet (spec §5.4). `role="dialog"`, Escape closes, focus moves in on open
 * and back to the previously focused element on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  side = 'right',
  className,
  labelledBy,
}: SheetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const previous = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    previous.current = document.activeElement
    const el = ref.current
    el?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    el?.addEventListener('keydown', onKey)
    return () => {
      el?.removeEventListener('keydown', onKey)
      const prev = previous.current
      if (prev instanceof HTMLElement) prev.focus({ preventScroll: true })
    }
  }, [open, onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={labelledBy ? undefined : title}
      aria-labelledby={labelledBy}
      aria-hidden={!open}
      tabIndex={-1}
      className={cx('as-sheet', `as-sheet--${side}`, open && 'is-open', className)}
    >
      {children}
    </div>
  )
}
