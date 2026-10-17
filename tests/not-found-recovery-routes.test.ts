import { describe, expect, it } from 'vitest'
import { lessons } from '../src/data/course'
import { LEGACY_PATH_ALIASES } from '../src/features/not-found/legacy-aliases'
import { getRecoverableRoutes } from '../src/features/not-found/routes'
import { ENGLISH_PATHS } from '../src/utils/english-routes'

describe('Smart 404 可恢复路由清单', () => {
  const routes = getRecoverableRoutes()

  it('输出唯一、有序、站内相对路径', () => {
    expect(routes).toEqual([...routes].sort())
    expect(new Set(routes).size).toBe(routes.length)

    for (const route of routes) {
      expect(route.startsWith('/')).toBe(true)
      expect(route.startsWith('//')).toBe(false)
      expect(route.includes('?')).toBe(false)
      expect(route.includes('#')).toBe(false)
      expect(route.includes('://')).toBe(false)
    }
  })

  it('覆盖全部课程、英文命名空间与静态入口，且不包含 dev/404', () => {
    for (const lesson of lessons) {
      expect(routes).toContain(`/learn/${lesson.slug}/`)
    }
    for (const route of Object.values(ENGLISH_PATHS)) {
      expect(routes).toContain(route)
    }
    expect(routes).toContain('/')
    expect(routes).toContain('/learn/')
    expect(routes).toContain('/roadmap/')
    expect(routes.some((route) => route.startsWith('/dev/'))).toBe(false)
    expect(routes).not.toContain('/404')
  })

  it('别名表中的每一项都指向真实路由，且当前审计为空', () => {
    for (const [key, target] of Object.entries(LEGACY_PATH_ALIASES)) {
      expect(key.startsWith('/')).toBe(true)
      expect(routes).toContain(target)
    }
    expect(Object.keys(LEGACY_PATH_ALIASES)).toEqual([])
  })
})
