import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  getStoredTheme,
  saveTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
} from '../src/utils/theme'

describe('学习页主题状态', () => {
  it('没有保存值或值无效时默认使用 light', () => {
    const storage = {
      getItem: () => 'sepia',
      setItem: () => undefined,
    }

    expect(getStoredTheme(storage)).toBe(DEFAULT_THEME)
    expect(getStoredTheme(undefined)).toBe('light')
  })

  it('使用独立 key 持久化主题选择', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    saveTheme(storage, 'dark')

    expect(values.get(THEME_STORAGE_KEY)).toBe('dark')
    expect(getStoredTheme(storage)).toBe('dark')
  })

  it('在 light 与 dark 之间切换', () => {
    expect(toggleTheme('light')).toBe('dark')
    expect(toggleTheme('dark')).toBe('light')
  })
})
