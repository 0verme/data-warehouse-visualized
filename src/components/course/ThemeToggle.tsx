import { useEffect, useRef, useState } from 'react'
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import {
  getStoredTheme,
  saveTheme,
  toggleTheme,
  type Theme,
  type ThemeStorage,
} from '../../utils/theme'

interface ThemeToggleProps {
  locale?: Locale
}

function getDocumentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function applyDocumentTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0d1726' : '#f5f7fb')
}

function getBrowserStorage(): ThemeStorage | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light'
  }

  return getStoredTheme(getBrowserStorage(), getDocumentTheme())
}

export function ThemeToggle({ locale = DEFAULT_LOCALE }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const hasHydrated = useRef(false)

  useEffect(() => {
    hasHydrated.current = true
  }, [])

  useEffect(() => {
    if (!hasHydrated.current) {
      return
    }

    applyDocumentTheme(theme)
    saveTheme(getBrowserStorage(), theme)
  }, [theme])

  function handleToggle() {
    const nextTheme = toggleTheme(getDocumentTheme())
    applyDocumentTheme(nextTheme)
    setTheme(nextTheme)
    saveTheme(getBrowserStorage(), nextTheme)
  }

  return (
    <button
      className="topbar-control theme-toggle"
      type="button"
      aria-label={getMessage('toggleTheme', locale)}
      title={getMessage('toggleTheme', locale)}
      onClick={handleToggle}
    >
      <svg
        className="theme-toggle__icon theme-toggle__icon--moon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
      <svg
        className="theme-toggle__icon theme-toggle__icon--sun"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    </button>
  )
}
