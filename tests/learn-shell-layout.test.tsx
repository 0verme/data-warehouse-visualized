import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug, lessons } from '../src/data/course'
import { LearnShell } from '../src/components/course/LearnShell'

function renderLearnShell(): string {
  const lesson = getLessonBySlug('why-data-warehouse')

  if (!lesson) {
    throw new Error('Unknown lesson: why-data-warehouse')
  }

  return renderToStaticMarkup(
    <LearnShell
      lessons={lessons}
      initialLesson={lesson}
      initialContent={getLessonContent(lesson)}
    />,
  )
}

describe('学习页 Learning Shell 布局', () => {
  it('将课程正文滚动区与三段式底部导航分开，并移除学习页 Footer', () => {
    const markup = renderLearnShell()
    const scrollStart = markup.indexOf('class="learn-main__scroll"')
    const navigationStart = markup.indexOf('class="lesson-nav"')

    expect(scrollStart).toBeGreaterThanOrEqual(0)
    expect(navigationStart).toBeGreaterThan(scrollStart)
    expect(markup).toContain('class="lesson-nav__link lesson-nav__link--previous')
    expect(markup).toContain('class="complete-button')
    expect(markup).toContain('class="lesson-nav__link lesson-nav__link--next"')
    expect(markup).not.toContain('class="site-footer')
    expect(markup).not.toContain('learn-footer')
  })

  it('保留首页 Footer 的使用入口', () => {
    const homepage = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8')

    expect(homepage).toContain('<SiteFooter variant="home" />')
  })

  it('使用固定视口与独立滚动布局，底栏不依赖 fixed 或 sidebar 偏移', () => {
    const stylesheet = readFileSync(
      new URL('../src/styles/layouts/learn-shell.css', import.meta.url),
      'utf8',
    )
    const navigationRuleStart = stylesheet.indexOf('.learn-main > .lesson-nav')
    const navigationRuleEnd = stylesheet.indexOf('.learn-main__crumbs', navigationRuleStart)
    const navigationRule = stylesheet.slice(navigationRuleStart, navigationRuleEnd)

    expect(stylesheet).toContain('height: 100vh;')
    expect(stylesheet).toContain('height: 100dvh;')
    expect(stylesheet).toContain('overflow-y: auto;')
    expect(stylesheet).toContain('.learn-main__scroll')
    expect(navigationRule).toContain('flex-shrink: 0;')
    expect(navigationRule).not.toContain('position: fixed')
    expect(navigationRule).not.toContain('left:')
  })
})
