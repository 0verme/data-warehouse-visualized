import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LearnShell } from '../src/components/course/LearnShell'
import { getLessonContent } from '../src/content/lessons'
import { lessons } from '../src/data/course'
import { ProgressIndicator } from '../src/components/lesson/ProgressIndicator'

function renderLearnShell(): string {
  const initialLesson = lessons[0]

  return renderToStaticMarkup(
    <LearnShell
      lessons={lessons}
      initialLesson={initialLesson}
      initialContent={getLessonContent(initialLesson)}
    />,
  )
}

function getTopbarMarkup(): string {
  const markup = renderLearnShell()
  const headerStart = markup.indexOf('<header class="learn-topbar">')
  const headerEnd = markup.indexOf('</header>', headerStart)

  if (headerStart < 0 || headerEnd < 0) {
    throw new Error('Learn topbar not found')
  }

  return markup.slice(headerStart, headerEnd)
}

describe('学习页顶部工具栏', () => {
  it('把 progress 放在顶栏中部，并保留 completed / total 语义', () => {
    const markup = renderLearnShell()

    expect(markup).toContain('class="learn-topbar"')
    expect(markup).toContain('class="learn-topbar__progress"')
    expect(markup).toContain('class="learn-topbar__nav"')
    expect(markup).toContain('class="learn-topbar__chapter"')
    expect(markup).toContain('认识数据仓库')
    expect(markup).toContain('class="learn-topbar__separator"')
    expect(markup).toContain('class="learn-topbar__lesson"')
    expect(markup).toContain('为什么有业务系统，还需要数据仓库？')
    expect(markup).toContain('data-progress-count="true">0 <small>/')
    expect(markup).toContain(`aria-valuemax="${lessons.length}"`)
    expect(markup).toContain('class="progress-indicator__track"')
  })

  it('渲染仅含地球图标且可访问的语言 Preview 入口与主题按钮', () => {
    const markup = renderLearnShell()

    expect(markup).toContain('class="topbar-control locale-switcher__trigger"')
    expect(markup).toContain('aria-haspopup="menu"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-label="切换语言"')
    expect(markup).toContain('title="切换语言"')
    expect(markup).toContain('<svg class="locale-switcher__globe"')
    expect(markup).not.toContain('locale-switcher__label')
    expect(markup).toContain('role="menuitemradio" aria-checked="true"')
    expect(markup).toContain('>简体中文</span>')
    expect(markup).toContain('>English · Preview</span>')
    expect(markup).toContain('class="topbar-control theme-toggle"')
    expect(markup).toContain('aria-label="切换浅色 / 深色主题"')
    expect(markup).toContain('title="切换浅色 / 深色主题"')
  })

  it('ProgressIndicator 仍显示 completed / total 数字', () => {
    const markup = renderToStaticMarkup(
      <ProgressIndicator completedCount={5} totalLessons={53} compact />,
    )

    expect(markup).toContain('data-progress-count="true">5 <small>/ 53</small>')
    expect(markup).toContain('<small>/ 53</small>')
    expect(markup).toContain('aria-valuenow="5"')
  })

  it('按 品牌 → 侧边栏控制 → 进度 → 语言/主题 的顺序组织同一套顶栏', () => {
    const topbar = getTopbarMarkup()
    const order = [
      'class="brand brand--learn"',
      'class="topbar-control sidebar-collapse-toggle"',
      'class="topbar-control sidebar-toggle"',
      'class="learn-topbar__progress"',
      'class="learn-topbar__actions"',
    ]
    const indexes = order.map((token) => topbar.indexOf(token))

    expect(indexes.every((index) => index >= 0)).toBe(true)
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b))
  })

  it('把移动端目录按钮放在左侧品牌控制区，不占用右侧语言/主题操作区', () => {
    const topbar = getTopbarMarkup()
    const actionsStart = topbar.indexOf('class="learn-topbar__actions"')
    const actions = topbar.slice(actionsStart)

    expect(topbar).toContain('class="topbar-control sidebar-toggle"')
    expect(topbar).toContain('aria-controls="course-sidebar"')
    expect(topbar).toContain('aria-label="课程目录"')
    expect(topbar).toContain('title="课程目录"')
    expect(actions).not.toContain('class="topbar-control sidebar-toggle"')
    expect(topbar).not.toContain('sidebar-toggle__label')
  })

  it('目录按钮使用标准 hamburger 图标，并与语言/主题按钮共用控件规格', () => {
    const topbar = getTopbarMarkup()
    const stylesheet = readFileSync(
      new URL('../src/styles/components/header-actions.css', import.meta.url),
      'utf8',
    )

    expect(topbar).toContain('<path d="M4 7h16M4 12h16M4 17h16"></path>')
    expect((topbar.match(/topbar-control/g) ?? []).length).toBe(4)
    expect(stylesheet).toContain('.topbar-control {')
    expect(stylesheet).toContain('justify-content: center;')
    expect(stylesheet).toContain('border-radius: 9px;')
    expect(stylesheet).toContain('height: 40px;')
  })
})
