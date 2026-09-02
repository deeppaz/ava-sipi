import { cx } from './cx.js'

export interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  /** Colour token name for the active state (e.g. 'current'). */
  color?: string
  id?: string
  disabled?: boolean
}

/** `role="switch"` toggle used by the layer rail (spec §5.7). */
export function Switch({ checked, onChange, label, color, id, disabled }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx('as-switch', checked && 'is-on')}
      style={color ? ({ '--switch-color': `var(--${color})` } as React.CSSProperties) : undefined}
      onClick={() => onChange(!checked)}
    >
      <span className="as-switch__thumb" />
    </button>
  )
}
