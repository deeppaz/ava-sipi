import type { ReactNode } from 'react'

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="as-kbd">{children}</kbd>
}
