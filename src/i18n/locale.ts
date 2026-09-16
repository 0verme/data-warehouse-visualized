export type Locale = 'zh-CN' | 'en'

export const DEFAULT_LOCALE: Locale = 'zh-CN'
export const LOCALE_STORAGE_KEY = 'data-warehouse-visualized:locale'

export interface LocaleStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const LOCALE_OPTIONS = [
  { locale: 'zh-CN', label: '简体中文', preview: false },
  { locale: 'en', label: 'English', preview: true },
] as const satisfies readonly { locale: Locale; label: string; preview: boolean }[]

export function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en'
}

export function parseLocale(value: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  return isLocale(value) ? value : fallback
}

export function getStoredLocale(
  storage: LocaleStorage | undefined,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  if (!storage) {
    return fallback
  }

  try {
    return parseLocale(storage.getItem(LOCALE_STORAGE_KEY), fallback)
  } catch {
    return fallback
  }
}

export function saveLocale(storage: LocaleStorage | undefined, locale: Locale): void {
  if (!storage) {
    return
  }

  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // 隐私模式或存储空间不足时，当前页面仍然可以切换语言预览。
  }
}
