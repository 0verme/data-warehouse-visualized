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
  it('SSR 第一章显示四节课程并保留 1-1 到 1-4 编号', () => {
    const markup = renderSidebarForLesson('why-data-warehouse')
    const chapterMarkup = getChapterMarkup(markup, '01')

    expect(chapterMarkup).toContain('aria-expanded="true"')
    expect(chapterMarkup).toContain('>0/4</span>')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-01"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-02"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-01-report-journey"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-01-terms"')
    expect(chapterMarkup).toContain('>为什么有业务系统，还需要数据仓库？</span>')
    expect(chapterMarkup).toContain('>这些数仓术语到底在说什么？</span>')
  })

  it('SSR 初始只展开当前课程所属章节，并保留当前课程高亮和章节进度', () => {
    const markup = renderSidebarForLesson('star-schema-and-grain')

    expect(getChapterMarkup(markup, '02')).toContain('aria-expanded="true"')
    expect(getChapterMarkup(markup, '02')).toContain('id="chapter-02"')
    expect(getChapterMarkup(markup, '02')).not.toContain(' hidden')

    for (const chapterId of ['01', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']) {
      const chapterMarkup = getChapterMarkup(markup, chapterId)
      expect(chapterMarkup).toContain('aria-expanded="false"')
      expect(chapterMarkup).toContain('hidden')
    }

    expect(markup).toContain('class="course-lesson is-active"')
    expect(markup).toContain('data-progress-lesson-link="lesson-star-schema-grain"')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('>0/5</span>')
  })

  it('SSR 展开第 03 章时显示四节存款指标课程', () => {
    const markup = renderSidebarForLesson('metric-system')
    const chapterMarkup = getChapterMarkup(markup, '03')

    expect(chapterMarkup).toContain('aria-expanded="true"')
    expect(chapterMarkup).toContain('>0/4</span>')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-04"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-metric-definition"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-metric-time"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-metric-derivations"')
  })

  it('SSR 展开第 07 章时显示五节数据血缘课程', () => {
    const markup = renderSidebarForLesson('data-lineage')
    const chapterMarkup = getChapterMarkup(markup, '07')

    expect(chapterMarkup).toContain('aria-expanded="true"')
    expect(chapterMarkup).toContain('>0/5</span>')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-08"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-08-fields"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-08-investigation"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-08-impact"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-08-evidence"')
  })

  it('SSR 展开第 10 章时只显示四节湖仓课程', () => {
    const markup = renderSidebarForLesson('lakehouse-table-layer')
    const chapterMarkup = getChapterMarkup(markup, '10')

    expect(chapterMarkup).toContain('aria-expanded="true"')
    expect(chapterMarkup).toContain('>0/4</span>')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-10"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-10-replication"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-10-table-layer"')
    expect(chapterMarkup).toContain('data-progress-lesson-link="lesson-10-unity"')
  })
})
