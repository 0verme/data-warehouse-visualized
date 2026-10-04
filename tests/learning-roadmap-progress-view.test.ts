import { describe, expect, it } from 'vitest'
import { isLessonAvailable, lessons } from '../src/data/course'
import { readRoadmapProgress } from '../src/features/learning-roadmap/progress-client'
import {
  projectLearningProgress,
  type StageProgress,
} from '../src/features/learning-roadmap/progress'
import {
  buildRoadmapProgressView,
  formatStageProgressLabel,
  formatTopicProgressLabel,
  type RoadmapProgressView,
} from '../src/features/learning-roadmap/progress-view'
import type { ProgressState } from '../src/utils/progress'

const availableLessonIds = lessons.filter(isLessonAvailable).map(({ id }) => id)

function viewFor(progress: ProgressState): RoadmapProgressView {
  return buildRoadmapProgressView(projectLearningProgress(progress))
}

function topicView(view: RoadmapProgressView, topicId: string) {
  const topic = view.topics.find((candidate) => candidate.topicId === topicId)
  if (!topic) throw new Error(`Missing Topic view: ${topicId}`)
  return topic
}

function stageView(view: RoadmapProgressView, stageId: string) {
  const stage = view.stages.find((candidate) => candidate.stageId === stageId)
  if (!stage) throw new Error(`Missing Stage view: ${stageId}`)
  return stage
}

describe('Roadmap progress view labels', () => {
  it('formats Topic states without mastery language', () => {
    expect(formatTopicProgressLabel('not_started', 0, 2)).toBe('未开始')
    expect(formatTopicProgressLabel('in_progress', 1, 3)).toBe('学习中 · 1 / 3')
    expect(formatTopicProgressLabel('completed', 1, 1)).toBe('已完成 · 1 / 1')
  })

  it('formats Stage copy from StageProgress and clamps defensive percentages', () => {
    const stage = (progress: number): StageProgress => ({
      stageId: 'foundation',
      completedLessons: 3,
      totalLessons: 5,
      progress,
    })

    expect(formatStageProgressLabel(stage(60))).toBe('3 / 5 节 · 60%')
    expect(formatStageProgressLabel(stage(120))).toBe('3 / 5 节 · 100%')
    expect(formatStageProgressLabel(stage(-8))).toBe('3 / 5 节 · 0%')
    expect(formatStageProgressLabel(stage(Number.NaN))).toBe('3 / 5 节 · 0%')
  })
})

describe('Roadmap progress view projection', () => {
  it('marks every Topic as 未开始 and every Stage as 0% for a fresh user', () => {
    const view = viewFor({ completedLessonIds: [], currentLessonId: '' })

    expect(view.topics).toHaveLength(32)
    expect(view.stages).toHaveLength(8)
    expect(view.current).toBeNull()
    expect(view.topics.every((topic) => topic.state === 'not_started')).toBe(true)
    expect(view.topics.every((topic) => topic.label === '未开始')).toBe(true)
    expect(view.topics.every((topic) => topic.isCurrent === false)).toBe(true)
    expect(view.stages.every((stage) => stage.percent === 0 && stage.label.endsWith('0%'))).toBe(
      true,
    )
    expect(view.stages.every((stage) => stage.isCurrent === false)).toBe(true)
  })

  it('projects a partially completed Topic and its Stage available-Lesson denominator', () => {
    const view = viewFor({ completedLessonIds: ['lesson-01'], currentLessonId: 'lesson-01' })
    const topic = topicView(view, 'warehouse-mental-model')
    const stage = stageView(view, 'foundation')

    expect(topic).toMatchObject({
      state: 'in_progress',
      label: '学习中 · 1 / 2',
      completedLessons: 1,
      totalLessons: 2,
      isCurrent: true,
    })
    // foundation owns 4 available Lessons: mental-model (2) + data-flow-and-layers (2).
    expect(stage.label).toBe('1 / 4 节 · 25%')
    expect(stage.percent).toBe(25)
    expect(stage.isCurrent).toBe(true)
  })

  it('projects a completed Topic without affecting unrelated Topics', () => {
    const view = viewFor({
      completedLessonIds: ['lesson-01', 'lesson-01-terms'],
      currentLessonId: 'lesson-01',
    })

    expect(topicView(view, 'warehouse-mental-model')).toMatchObject({
      state: 'completed',
      label: '已完成 · 2 / 2',
    })
    expect(topicView(view, 'data-flow-and-layers').state).toBe('not_started')
  })

  it('marks the current Topic and Stage independently from completion state', () => {
    const view = viewFor({ completedLessonIds: [], currentLessonId: 'lesson-13-1' })

    expect(view.current).toEqual({
      lessonId: 'lesson-13-1',
      topicId: 'production-lifecycle-debugging',
      stageId: 'serving-production',
    })
    expect(topicView(view, 'production-lifecycle-debugging')).toMatchObject({
      state: 'not_started',
      label: '未开始',
      isCurrent: true,
    })
    expect(stageView(view, 'serving-production').isCurrent).toBe(true)
    expect(view.topics.filter((topic) => topic.isCurrent)).toHaveLength(1)
    expect(view.stages.filter((stage) => stage.isCurrent)).toHaveLength(1)
  })

  it('falls back safely when currentLessonId cannot be mapped to an available Lesson', () => {
    const view = viewFor({ completedLessonIds: [], currentLessonId: 'lesson-removed' })

    expect(view.current).toBeNull()
    expect(view.topics.every((topic) => topic.isCurrent === false)).toBe(true)
    expect(view.stages.every((stage) => stage.isCurrent === false)).toBe(true)
  })

  it('keeps optional synthesis Lessons inside the Stage available-Lesson denominator', () => {
    const view = viewFor({ completedLessonIds: ['lesson-12'], currentLessonId: 'lesson-12' })
    const stage = stageView(view, 'serving-production')

    expect(stage.totalLessons).toBe(13)
    expect(topicView(view, 'capstone-delivery')).toMatchObject({
      state: 'completed',
      label: '已完成 · 1 / 1',
    })
    expect(stage.label).toBe('1 / 13 节 · 8%')
  })

  it('marks all 32 Topics completed and all 8 Stages at 100% for a completed course', () => {
    const view = viewFor({
      completedLessonIds: availableLessonIds,
      currentLessonId: availableLessonIds[0],
    })

    expect(availableLessonIds).toHaveLength(55)
    expect(view.topics).toHaveLength(32)
    expect(view.topics.every((topic) => topic.state === 'completed')).toBe(true)
    expect(
      view.topics.every(
        (topic) => topic.label === `已完成 · ${topic.totalLessons} / ${topic.totalLessons}`,
      ),
    ).toBe(true)
    expect(view.topics.every((topic) => topic.completedLessons === topic.totalLessons)).toBe(true)

    expect(view.stages).toHaveLength(8)
    for (const stage of view.stages) {
      expect(stage.percent).toBe(100)
      expect(stage.label).toBe(`${stage.totalLessons} / ${stage.totalLessons} 节 · 100%`)
      expect(stage.completedLessons).toBe(stage.totalLessons)
    }
    expect(view.stages.reduce((sum, stage) => sum + stage.totalLessons, 0)).toBe(55)
    expect(view.stages.reduce((sum, stage) => sum + stage.completedLessons, 0)).toBe(55)
    // The current location stays independent from the completed state.
    expect(view.current).not.toBeNull()
    expect(view.topics.some((topic) => topic.isCurrent)).toBe(true)
  })
})

describe('Roadmap progress storage read', () => {
  function storageFor(raw: string | null): { getItem: () => string | null; setItem: () => void } {
    return { getItem: () => raw, setItem: () => {} }
  }

  it('reads a valid stored ProgressState and keeps a mapped current Lesson', () => {
    const raw = JSON.stringify({
      completedLessonIds: ['lesson-01', 'lesson-03', 'lesson-01'],
      currentLessonId: 'lesson-03',
    })

    expect(readRoadmapProgress(storageFor(raw), availableLessonIds)).toEqual({
      completedLessonIds: ['lesson-01', 'lesson-03'],
      currentLessonId: 'lesson-03',
    })
  })

  it('falls back to the empty state for malformed or missing storage', () => {
    expect(readRoadmapProgress(storageFor('{not-json'), availableLessonIds)).toEqual({
      completedLessonIds: [],
      currentLessonId: '',
    })
    expect(readRoadmapProgress(storageFor(null), availableLessonIds)).toEqual({
      completedLessonIds: [],
      currentLessonId: '',
    })
    expect(readRoadmapProgress(undefined, availableLessonIds)).toEqual({
      completedLessonIds: [],
      currentLessonId: '',
    })
  })

  it('drops stale Lesson IDs and an unmappable current Lesson', () => {
    const raw = JSON.stringify({
      completedLessonIds: ['lesson-01', 'removed-lesson'],
      currentLessonId: 'removed-lesson',
    })

    expect(readRoadmapProgress(storageFor(raw), availableLessonIds)).toEqual({
      completedLessonIds: ['lesson-01'],
      currentLessonId: '',
    })
  })
})
