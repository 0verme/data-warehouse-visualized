export const THEME_STORAGE_KEY = 'data-warehouse-visualized:theme'

export type Theme = 'light' | 'dark'

export interface ThemeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const DEFAULT_THEME: Theme = 'light'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

export function parseTheme(value: unknown, fallback: Theme = DEFAULT_THEME): Theme {
  return isTheme(value) ? value : fallback
}

export function getStoredTheme(
  storage: ThemeStorage | undefined,
  fallback: Theme = DEFAULT_THEME,
): Theme {
  if (!storage) {
    return fallback
  }

  try {
    return parseTheme(storage.getItem(THEME_STORAGE_KEY), fallback)
  } catch {
    return fallback
  }
}

export function saveTheme(storage: ThemeStorage | undefined, theme: Theme): void {
  if (!storage) {
    return
  }

  try {
    storage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 隐私模式或存储空间不足时，主题仍然可以在当前页面生效。
  }
}

export function toggleTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}
