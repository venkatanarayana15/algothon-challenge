import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'a2z-theme'

function initial(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function apply(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('light', theme === 'light')
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#07090f')
}

/**
 * Site theme, dark by default.
 *
 * Persists the choice, honours the OS preference on first visit, and keeps
 * `color-scheme` in sync so scrollbars and form controls follow the theme
 * instead of staying dark under a light page. The pre-paint script in
 * index.html applies the stored class before first render to avoid a flash;
 * this hook owns every change after that.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial)

  useEffect(() => {
    apply(theme)
    window.localStorage.setItem(KEY, theme)
  }, [theme ])

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggle }
}