import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chapters, getChapterTitle, isLessonAvailable, lessons } from '../src/data/course'

/**
 * README anti-drift contract.
 *
 * `README.md` restates facts that already live in `src/data/course.ts`
 * (chapter list, chapter titles, lesson counts, online status, interactive
 * lesson entries, visualization workbench kinds). Those numbers had drifted
 * before, so the README is not generated — it is asserted here instead.
 *
 * If a course change makes this test fail, update `README.md`; if the README
 * sentence or table shape is intentionally restructured, update the parsers in
 * this file in the same commit so the contract keeps covering the new shape.
 */
const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

const COURSE_FACT_SENTENCE =
  /当前课程定义包含 \*\*(\d+) 个章节、(\d+) 节课程\*\*：其中 \*\*(\d+) 节已上线，(\d+) 节规划中\*\*。按已上线课程的实验入口计，当前有 \*\*(\d+) 个交互实验入口\*\*，对应 \*\*(\d+) 类实验工作台\*\*。/

interface ReadmeChapterRow {
  title: string
  lessonCount: number
  status: string
}

function parseChapterTable(readme: string): Map<string, ReadmeChapterRow> {
  const rows = new Map<string, ReadmeChapterRow>()

  for (const line of readme.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    const label = /^(?:\[第 (\d{2}) 章\]\([^)]*\)|第 (\d{2}) 章)$/.exec(cells[1] ?? '')
    if (!label) continue

    rows.set(label[1] ?? label[2], {
      title: cells[2] ?? '',
      lessonCount: Number(cells[3]),
      status: cells[4] ?? '',
    })
  }

  return rows
}

const derived = {
  chapterCount: chapters.length,
  lessonCount: lessons.length,
  availableLessonCount: lessons.filter(isLessonAvailable).length,
  plannedLessonCount: lessons.filter((lesson) => !isLessonAvailable(lesson)).length,
  interactiveEntryCount: lessons.filter(isLessonAvailable).length,
  workbenchKindCount: new Set(lessons.filter(isLessonAvailable).map((lesson) => lesson.demo)).size,
}

describe('README 课程事实与 src/data/course.ts 保持一致', () => {
  it('README 课程统计句与 course.ts 派生值一致', () => {
    const match = COURSE_FACT_SENTENCE.exec(README)
    expect(match, 'README 课程统计句格式变化，请同步更新本测试的解析表达式').not.toBeNull()

    const [
      chapterCount,
      lessonCount,
      availableLessonCount,
      plannedLessonCount,
      interactiveEntryCount,
      workbenchKindCount,
    ] = match!.slice(1).map(Number)

    expect({
      chapterCount,
      lessonCount,
      availableLessonCount,
      plannedLessonCount,
      interactiveEntryCount,
      workbenchKindCount,
    }).toEqual(derived)
  })

  it('README 章节表与 course.ts 的章节 / 课程数 / 上线状态一致', () => {
    const rows = parseChapterTable(README)

    expect([...rows.keys()].sort()).toEqual(chapters.map((chapter) => chapter.id).sort())

    for (const chapter of chapters) {
      const row = rows.get(chapter.id)
      expect(row, `README 缺少第 ${chapter.id} 章`).toBeDefined()

      const expectedStatus = chapter.lessons.some(isLessonAvailable) ? '已上线' : '规划中'
      expect({
        title: row!.title,
        lessonCount: row!.lessonCount,
        status: row!.status,
      }).toEqual({
        title: getChapterTitle(chapter.id),
        lessonCount: chapter.lessons.length,
        status: expectedStatus,
      })
    }
  })

  it('README 学习路线正文引用 course.ts 里的第 12 / 13 章名称', () => {
    expect(README).toContain(getChapterTitle('12'))
    expect(README).toContain(getChapterTitle('13'))
  })
})
