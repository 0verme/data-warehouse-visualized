import { describe, expect, it } from 'vitest'
import { resolvePathRecovery } from '../src/utils/path-recovery'

const routes = [
  '/',
  '/learn/',
  '/learn/grain/',
  '/learn/why-data-warehouse/',
  '/en/',
  '/en/data-warehouse/grain/',
]

describe('Smart 404 路径恢复解析', () => {
  it('对完全存在的路由不给出多余建议', () => {
    expect(resolvePathRecovery('/learn/grain/', { routes })).toEqual({
      kind: 'exact',
      suggestion: null,
    })
    expect(resolvePathRecovery('/learn/grain', { routes })).toEqual({
      kind: 'exact',
      suggestion: null,
    })
    expect(resolvePathRecovery('/', { routes })).toEqual({ kind: 'exact', suggestion: null })
  })

  it('仅在同一路由大小写不一致时给出规范地址', () => {
    expect(resolvePathRecovery('/Learn/Grain/', { routes })).toEqual({
      kind: 'case-insensitive',
      suggestion: '/learn/grain/',
    })
    expect(resolvePathRecovery('/learn/GRAIN', { routes })).toEqual({
      kind: 'case-insensitive',
      suggestion: '/learn/grain/',
    })
    expect(resolvePathRecovery('/EN/', { routes })).toEqual({
      kind: 'case-insensitive',
      suggestion: '/en/',
    })
  })

  it('对未知路径绝不猜测相似页', () => {
    const unknown = [
      '/gra',
      '/learn/grai/',
      '/learn/grain/report/',
      '/learn/unknown-lesson/',
      '/123',
      '/nonexistent-page-test',
      '//evil.example/learn/grain/',
      '/learn/grain/?next=https://evil.example',
    ]

    for (const pathname of unknown) {
      expect(resolvePathRecovery(pathname, { routes })).toEqual({ kind: 'none', suggestion: null })
    }
  })

  it('只采用目标真实存在的显式别名', () => {
    expect(
      resolvePathRecovery('/old-grain/', {
        routes,
        aliases: { '/old-grain': '/learn/grain/' },
      }),
    ).toEqual({ kind: 'alias', suggestion: '/learn/grain/' })

    expect(
      resolvePathRecovery('/old-grain/', {
        routes,
        aliases: { '/old-grain': '/deleted-page/' },
      }),
    ).toEqual({ kind: 'none', suggestion: null })

    expect(
      resolvePathRecovery('/OLD-GRAIN/', {
        routes,
        aliases: { '/old-grain': '/learn/grain/' },
      }),
    ).toEqual({ kind: 'none', suggestion: null })
  })

  it('在 BASE_PATH 部署下仍能剥离前缀并匹配', () => {
    expect(
      resolvePathRecovery('/seo-base-path/learn/Grain/', {
        routes,
        basePath: '/seo-base-path',
      }),
    ).toEqual({ kind: 'case-insensitive', suggestion: '/learn/grain/' })
    expect(resolvePathRecovery('/seo-base-path/', { routes, basePath: '/seo-base-path' })).toEqual({
      kind: 'exact',
      suggestion: null,
    })
    expect(resolvePathRecovery('/learn/Grain/', { routes, basePath: '/seo-base-path' })).toEqual({
      kind: 'case-insensitive',
      suggestion: '/learn/grain/',
    })
  })

  it('对编码、超长与非法输入安全降级', () => {
    expect(resolvePathRecovery('/learn/%47rain/', { routes })).toEqual({
      kind: 'case-insensitive',
      suggestion: '/learn/grain/',
    })
    expect(resolvePathRecovery('/learn/%E0%A4%A', { routes })).toEqual({
      kind: 'none',
      suggestion: null,
    })
    expect(resolvePathRecovery(`/${'a'.repeat(600)}`, { routes })).toEqual({
      kind: 'none',
      suggestion: null,
    })
    expect(resolvePathRecovery('https://evil.example/learn/grain/', { routes })).toEqual({
      kind: 'none',
      suggestion: null,
    })
  })
})
