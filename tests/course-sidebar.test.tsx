import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug, lessons } from '../src/data/course'
import { LearnShell } from '../src/components/course/LearnShell'

function renderSidebarForLesson(slug: string): string {
  const lesson = getLessonBySlug(slug)

  if (!lesson) {
    throw new Error(`Unknown lesson: ${slug}`)
  }

  return renderToStaticMarkup(
    <LearnShell
      lessons={lessons}
      initialLesson={lesson}
      initialContent={getLessonContent(lesson)}
    />,
  )
}

function getChapterMarkup(markup: string, chapterId: string): string {
  const start = markup.indexOf(`data-course-chapter="${chapterId}"`)
  const end = markup.indexOf('</section>', start)

  if (start === -1 || end === -1) {
    throw new Error(`Chapter ${chapterId} was not rendered`)
  }

  return markup.slice(start, end)
}

describe('课程 Sidebar Accordion', () => {
  it('SSR 初始只展开当前课程所属章节，并保留当前课程高亮和章节进度', () => {
    const markup = renderSidebarForLesson('star-schema-and-grain')

    expect(getChapterMarkup(markup, '03')).toContain('aria-expanded="true"')
    expect(getChapterMarkup(markup, '03')).toContain('id="chapter-03"')
    expect(getChapterMarkup(markup, '03')).not.toContain(' hidden')

    for (const chapterId of ['01', '02', '04', '05', '06', '07', '08', '09', '10', '11', '12']) {
      const chapterMarkup = getChapterMarkup(markup, chapterId)
      expect(chapterMarkup).toContain('aria-expanded="false"')
      expect(chapterMarkup).toContain('hidden')
    }

    expect(markup).toContain('class="course-lesson is-active"')
    expect(markup).toContain('data-progress-lesson-link="lesson-star-schema-grain"')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('>0/5</span>')
  })
})
