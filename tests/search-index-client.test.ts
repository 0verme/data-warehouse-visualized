import { afterEach, describe, expect, it, vi } from 'vitest'

const validIndex = { version: 1, lessons: [], docs: [] }

async function importLoader() {
  vi.resetModules()
  return import('../src/features/search/load-index')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('按需加载搜索索引', () => {
  it('并发与后续打开复用同一浏览器会话中的 fetch 结果', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => validIndex,
    })
    vi.stubGlobal('fetch', fetchMock)
    const { loadSearchIndex } = await importLoader()

    const [first, concurrent] = await Promise.all([loadSearchIndex(), loadSearchIndex()])
    const reopened = await loadSearchIndex()

    expect(first).toBe(concurrent)
    expect(reopened).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/search-index.json', {
      headers: { Accept: 'application/json' },
    })
  })

  it('拒绝 HTTP / schema 错误，并在请求失败后允许重试', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...validIndex, version: 2 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => validIndex })
    vi.stubGlobal('fetch', fetchMock)
    const { loadSearchIndex } = await importLoader()

    await expect(loadSearchIndex()).rejects.toThrow('503')
    await expect(loadSearchIndex()).rejects.toThrow('unsupported or invalid schema')
    await expect(loadSearchIndex()).resolves.toEqual(validIndex)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
