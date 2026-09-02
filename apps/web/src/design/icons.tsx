import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 18, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const Icons = {
  river: (p: P) => (
    <Svg {...p}>
      <path d="M3 8c3-3 6 3 9 0s6 3 9 0" />
      <path d="M3 14c3-3 6 3 9 0s6 3 9 0" />
      <path d="M3 20c3-3 6 3 9 0s6 3 9 0" opacity=".55" />
    </Svg>
  ),
  gauge: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </Svg>
  ),
  event: (p: P) => (
    <Svg {...p}>
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" />
    </Svg>
  ),
  reservoir: (p: P) => (
    <Svg {...p}>
      <path d="M4 10h16" />
      <path d="M5 10l1.5 9h11L19 10" />
      <path d="M8 14c2-1 3 1 5 0s2 1 3 0" opacity=".7" />
    </Svg>
  ),
  groundwater: (p: P) => (
    <Svg {...p}>
      <path d="M3 6h18" />
      <path d="M12 6v6" />
      <path d="M5 15c2-2 4 2 7 0s5 2 7 0" />
      <path d="M5 19c2-2 4 2 7 0s5 2 7 0" opacity=".55" />
    </Svg>
  ),
  drought: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="9" r="4" />
      <path d="M12 1v2M12 15v2M4 9H2M22 9h-2M6.3 3.3l1.4 1.4M16.3 4.7l1.4-1.4" />
      <path d="M4 20l4-4 3 3 3-5 6 6" />
    </Svg>
  ),
  glacier: (p: P) => (
    <Svg {...p}>
      <path d="M3 19l5-9 3 5 3-8 7 12z" />
      <path d="M8 10l2 3" opacity=".6" />
    </Svg>
  ),
  snow: (p: P) => (
    <Svg {...p}>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
    </Svg>
  ),
  tide: (p: P) => (
    <Svg {...p}>
      <path d="M3 12c3-4 6 4 9 0s6 4 9 0" />
      <path d="M12 4v4M9 6l3-3 3 3" />
    </Svg>
  ),
  search: (p: P) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </Svg>
  ),
  command: (p: P) => (
    <Svg {...p}>
      <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />
    </Svg>
  ),
  close: (p: P) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  external: (p: P) => (
    <Svg {...p}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </Svg>
  ),
  share: (p: P) => (
    <Svg {...p}>
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M8 11l8-4M8 13l8 4" />
    </Svg>
  ),
  play: (p: P) => (
    <Svg {...p}>
      <path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  chevronLeft: (p: P) => (
    <Svg {...p}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  ),
  chevronRight: (p: P) => (
    <Svg {...p}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  ),
  live: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" opacity=".6" />
    </Svg>
  ),
  legend: (p: P) => (
    <Svg {...p}>
      <path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10" />
    </Svg>
  ),
  globe: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </Svg>
  ),
  story: (p: P) => (
    <Svg {...p}>
      <path d="M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z" />
    </Svg>
  ),
  pulse: (p: P) => (
    <Svg {...p}>
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </Svg>
  ),
} as const

export type IconName = keyof typeof Icons
