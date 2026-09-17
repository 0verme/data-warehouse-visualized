import { getStoredLocale, saveLocale, type Locale } from '../i18n/locale'

export function subscribeToLocaleChanges(onChange: () => void): () => void {
  if (typeof document === 'undefined') {
    return () => undefined
  }

  document.addEventListener('dwv:locale-change', onChange)

  return () => document.removeEventListener('dwv:locale-change', onChange)
}

export function getLocaleSnapshot(fallback: Locale): Locale {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    return getStoredLocale(window.localStorage, fallback)
  } catch {
    return fallback
  }
}

export function setLocale(nextLocale: Locale): void {
  if (typeof window !== 'undefined') {
    try {
      saveLocale(window.localStorage, nextLocale)
    } catch {
      // localStorage 受限时仍然在当前页面切换语言。
    }
  }

  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.lang = nextLocale
  document.dispatchEvent(new Event('dwv:locale-change'))
}
