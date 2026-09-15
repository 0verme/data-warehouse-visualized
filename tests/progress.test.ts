import { describe, expect, it } from 'vitest'
import { lessons } from '../src/data/course'
import {
  createInitialProgress,
  getProgressPercent,
  loadProgress,
  normalizeProgress,
  parseProgress,
  PROGRESS_STORAGE_KEY,
  saveProgress,
  setCurrentLesson,
  toggleLessonComplete,
} from '../src/utils/progress'

const initial = createInitialProgress('lesson-01')

describe('学习进度', () => {
  it('解析保存的数据并去重完成课程', () => {
    const progress = parseProgress(
      JSON.stringify({
        completedLessonIds: ['lesson-01', 'lesson-01', 2],
        currentLessonId: 'lesson-02',
      }),
      initial,
    )

    expect(progress).toEqual({
      completedLessonIds: ['lesson-01'],
      currentLessonId: 'lesson-02',
    })
  })

  it('损坏数据回退到初始状态', () => {
    expect(parseProgress('{not-json', initial)).toEqual(initial)
    expect(parseProgress(null, initial)).toEqual(initial)
  })

  it('切换完成状态并计算百分比', () => {
    const completed = toggleLessonComplete(initial, 'lesson-01')
    const reopened = toggleLessonComplete(completed, 'lesson-01')

    expect(completed.completedLessonIds).toEqual(['lesson-01'])
    expect(getProgressPercent(completed, 4)).toBe(25)
    expect(reopened.completedLessonIds).toEqual([])
  })

  it('按当前课程集合清理进度并按页面类型选择当前课程', () => {
    const progress = {
      completedLessonIds: ['lesson-01', 'removed-lesson', 'lesson-01'],
      currentLessonId: 'lesson-02',
    }

    expect(normalizeProgress(progress, ['lesson-01', 'lesson-02'], 'lesson-01', true)).toEqual({
      completedLessonIds: ['lesson-01'],
      currentLessonId: 'lesson-02',
    })
    expect(normalizeProgress(progress, ['lesson-01', 'lesson-02'], 'lesson-01', false)).toEqual({
      completedLessonIds: ['lesson-01'],
      currentLessonId: 'lesson-01',
    })
  })

  it('新增第三章课程后仍保留旧课程的完成记录', () => {
    const legacyProgress = {
      completedLessonIds: ['lesson-01', 'lesson-03', 'lesson-scd-type-2'],
      currentLessonId: 'lesson-03',
    }

    expect(
      normalizeProgress(
        legacyProgress,
        lessons.map((lesson) => lesson.id),
        'lesson-01',
        true,
      ),
    ).toEqual(legacyProgress)
  })

  it('更新当前课程而不丢失完成记录', () => {
    const progress = toggleLessonComplete(initial, 'lesson-01')
    const moved = setCurrentLesson(progress, 'lesson-08')

    expect(moved).toEqual({
      completedLessonIds: ['lesson-01'],
      currentLessonId: 'lesson-08',
    })
  })

  it('通过 localStorage 兼容接口保存和读取进度', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const progress = setCurrentLesson(toggleLessonComplete(initial, 'lesson-01'), 'lesson-02')

    saveProgress(storage, progress)

    expect(values.has(PROGRESS_STORAGE_KEY)).toBe(true)
    expect(loadProgress(storage, initial)).toEqual(progress)
  })
})
