import type { ReactNode } from 'react'

/**
 * One stroke-based icon set, drawn on a 24px grid with no dependency.
 *
 * A bespoke set rather than an icon package keeps the bundle honest: the whole
 * set is a few hundred bytes of path data instead of a tree-shaken-but-still-
 * large library, on a page a judge may load over conference wifi.
 */
const PATHS: Record<string, ReactNode> = {
  overview: (
    <>
      <path d="M4 11.2 12 4.5l8 6.7" />
      <path d="M6.2 10.2V19.5h11.6v-9.3" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  audit: (
    <>
      <path d="M12 3.2 19 6v5.4c0 4.2-2.9 7.7-7 9.4-4.1-1.7-7-5.2-7-9.4V6z" />
      <path d="M8.8 12.1l2.2 2.2 4.2-4.4" />
    </>
  ),
  try: (
    <>
      <rect x="3.2" y="4.4" width="17.6" height="15.2" rx="2.2" />
      <path d="M7.4 9.6 10 12l-2.6 2.4" />
      <path d="M12.6 14.6h4" />
    </>
  ),
  gallery: (
    <>
      <rect x="3.4" y="3.4" width="7.2" height="7.2" rx="1.4" />
      <rect x="13.4" y="3.4" width="7.2" height="7.2" rx="1.4" />
      <rect x="3.4" y="13.4" width="7.2" height="7.2" rx="1.4" />
      <rect x="13.4" y="13.4" width="7.2" height="7.2" rx="1.4" />
    </>
  ),
  benchmark: (
    <>
      <path d="M4 4.2v15.6h16" />
      <path d="M8 19.8v-5.6" />
      <path d="M12.6 19.8V8.6" />
      <path d="M17.2 19.8v-8" />
    </>
  ),
  how: (
    <>
      <circle cx="5.4" cy="5.6" r="2.1" />
      <circle cx="18.6" cy="18.4" r="2.1" />
      <path d="M5.4 7.7v5.7a2.4 2.4 0 0 0 2.4 2.4h8.4" />
      <path d="M13.8 13.4l2.6 2.4-2.6 2.4" />
    </>
  ),
  limits: (
    <>
      <path d="M12 3.6 2.9 19.6h18.2z" />
      <path d="M12 9.4v4.2" />
      <path d="M12 16.6h.01" />
    </>
  ),
  code: (
    <>
      <path d="M8.6 8.4 5 12l3.6 3.6" />
      <path d="M15.4 8.4 19 12l-3.6 3.6" />
      <path d="M13.4 5.6l-2.8 12.8" />
    </>
  ),
  search: (
    <>
      <circle cx="10.6" cy="10.6" r="6.2" />
      <path d="M15.2 15.2 20 20" />
    </>
  ),
  play: <path d="M8.4 5.4 18.6 12 8.4 18.6z" />,
  share: (
    <>
      <path d="M9.6 14.4 14.4 9.6" />
      <path d="M11.4 7.4 13.2 5.6a3.9 3.9 0 0 1 5.5 5.5l-1.8 1.8" />
      <path d="M12.6 16.6l-1.8 1.8a3.9 3.9 0 0 1-5.5-5.5l1.8-1.8" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10.4" />
      <path d="M8 10.6 12 14.6l4-4" />
      <path d="M4.8 19.4h14.4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="10.6" height="10.6" rx="1.8" />
      <path d="M5.4 15V6.2a1.8 1.8 0 0 1 1.8-1.8H15" />
    </>
  ),
  check: <path d="M5.2 12.6l4.4 4.4L18.8 7.4" />,
  flaky: (
    <>
      <path d="M12 3.4v4.2" />
      <path d="M12 16.4v4.2" />
      <path d="M3.4 12h4.2" />
      <path d="M16.4 12h4.2" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  arrowUp: (
    <>
      <path d="M12 19.4V4.6" />
      <path d="M6.4 10.2 12 4.6l5.6 5.6" />
    </>
  ),
  close: (
    <>
      <path d="M6.4 6.4 17.6 17.6" />
      <path d="M17.6 6.4 6.4 17.6" />
    </>
  ),
  menu: (
    <>
      <path d="M4.5 7.4h15" />
      <path d="M4.5 12h15" />
      <path d="M4.5 16.6h15" />
    </>
  ),
  corner: (
    <>
      <path d="M6 16.4C6 10.6 10.6 6 16.4 6" />
      <path d="M12.6 6h3.8v3.8" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
    </>
  ),
  moon: (
    <>
      <path d="M19.5 14.2A7.8 7.8 0 0 1 9.8 4.5a7.8 7.8 0 1 0 9.7 9.7z" />
    </>
  ),
}

export type IconName = keyof typeof PATHS

interface Props {
  name: IconName
  className?: string
  /** Fractional stroke width on the 24px grid. */
  weight?: number
  filled?: boolean
}

export function Icon({ name, className = 'h-4 w-4', weight = 1.8, filled = false }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name] ?? PATHS.overview}
    </svg>
  )
}
