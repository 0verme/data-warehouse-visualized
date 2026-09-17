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

describe('学习页顶部工具栏', () => {
  it('把 progress 放在顶栏中部，并保留 completed / total 语义', () => {
    const markup = renderLearnShell()

    expect(markup).toContain('class="learn-topbar"')
    expect(markup).toContain('class="learn-topbar__progress"')
    expect(markup).toContain('data-progress-count="true">0 <small>/')
    expect(markup).toContain(`aria-valuemax="${lessons.length}"`)
    expect(markup).toContain('class="progress-indicator__track"')
  })

  it('渲染仅含地球图标且可访问的语言 Preview 入口与主题按钮', () => {
    const markup = renderLearnShell()

    expect(markup).toContain('class="locale-switcher__trigger"')
    expect(markup).toContain('aria-haspopup="menu"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-label="切换语言"')
    expect(markup).toContain('title="切换语言"')
    expect(markup).toContain('<svg class="locale-switcher__globe"')
    expect(markup).not.toContain('locale-switcher__label')
    expect(markup).toContain('role="menuitemradio" aria-checked="true"')
    expect(markup).toContain('>简体中文</span>')
    expect(markup).toContain('>English · Preview</span>')
    expect(markup).toContain('class="theme-toggle"')
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
})
