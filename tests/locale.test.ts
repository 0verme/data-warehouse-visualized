import { describe, expect, it } from 'vitest'
import { getStoredLocale, LOCALE_OPTIONS, LOCALE_STORAGE_KEY, saveLocale } from '../src/i18n/locale'
import { getMessage } from '../src/i18n/messages'

describe('学习页 locale preview', () => {
  it('提供中文当前项与 English Preview 选项', () => {
    expect(LOCALE_OPTIONS).toEqual([
      { locale: 'zh-CN', label: '简体中文', preview: false },
      { locale: 'en', label: 'English', preview: true },
    ])
    expect(getMessage('englishPreview', 'en')).toBe('English · Preview')
  })

  it('按独立 key 持久化 locale，并能恢复选择', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    saveLocale(storage, 'en')

    expect(values.get(LOCALE_STORAGE_KEY)).toBe('en')
    expect(getStoredLocale(storage)).toBe('en')
  })
})
