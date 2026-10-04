import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getHomeStartPaths, HomeStartPaths } from '../src/components/HomeStartPaths'
import { lessons } from '../src/data/course'

const homepage = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8')

describe('首页「从哪里开始」入口', () => {
  it('位于 Hero 与 Data Flow 之间，并按 SSR 静态区块渲染', () => {
    const heroStart = homepage.indexOf('class="home-hero"')
    const heroEnd = homepage.indexOf('</section>', heroStart)
    const startIndex = homepage.indexOf('<HomeStartPaths />')
    const dataLessonIndex = homepage.indexOf('class="home-data-lesson"')

    expect(heroEnd).toBeGreaterThanOrEqual(0)
    expect(startIndex).toBeGreaterThan(heroEnd)
    expect(dataLessonIndex).toBeGreaterThan(startIndex)
    expect(homepage).not.toContain('HomeStartPaths client:')
  })

  it('渲染「从哪里开始？」标题与三条用户路径', () => {
    const markup = renderToStaticMarkup(<HomeStartPaths />)
    const paths = getHomeStartPaths()

    expect(markup).toContain('<h2 id="home-start-title">从哪里开始？</h2>')
    expect((markup.match(/class="home-start-path"/g) ?? []).length).toBe(3)

    for (const path of paths) {
      expect(markup).toContain(path.audience)
      expect(markup).toContain(path.description)
      expect(markup).toContain(path.cta)
    }

    expect(paths.map((path) => path.cta)).toEqual(['从基础开始', '进入进阶路线', '看生产实践'])
  })

  it('三条路径指向真实存在的课程页面', () => {
    const paths = getHomeStartPaths()

    expect(paths.map((path) => path.href)).toEqual([
      '/learn/',
      '/learn/data-modeling/',
      '/learn/lifecycle-path-failure/',
    ])
    expect(lessons.some((lesson) => lesson.slug === 'data-modeling')).toBe(true)
    expect(lessons.some((lesson) => lesson.slug === 'lifecycle-path-failure')).toBe(true)
  })
})
