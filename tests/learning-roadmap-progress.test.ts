import { describe, expect, it } from 'vitest'
import { learningGraph } from '../src/features/learning-roadmap/graph'
import { projectLearningProgress } from '../src/features/learning-roadmap/progress'
import type { LearningGraph } from '../src/features/learning-roadmap/types'
import type { ProgressState } from '../src/utils/progress'

function cloneGraph(): LearningGraph {
  return {
    ...learningGraph,
    stages: learningGraph.stages.map((stage) => ({ ...stage })),
    topics: learningGraph.topics.map((topic) => ({
      ...topic,
      lessonIds: [...topic.lessonIds],
      prerequisites: [...topic.prerequisites],
      recommendedPrior: topic.recommendedPrior ? [...topic.recommendedPrior] : undefined,
      relatedTopics: topic.relatedTopics ? [...topic.relatedTopics] : undefined,
    })),
  }
}

function topicProgress(progress: ProgressState, topicId: string, graph = learningGraph) {
  const topic = projectLearningProgress(progress, graph).topics.find(
    (candidate) => candidate.topicId === topicId,
  )
  if (!topic) throw new Error(`Missing projected Topic: ${topicId}`)
  return topic
}

function stageProgress(progress: ProgressState, stageId: string, graph = learningGraph) {
  const stage = projectLearningProgress(progress, graph).stages.find(
    (candidate) => candidate.stageId === stageId,
  )
  if (!stage) throw new Error(`Missing projected Stage: ${stageId}`)
  return stage
}

describe('Lesson Progress projection', () => {
  it('projects a single-Lesson Topic from 0/1 to 1/1', () => {
    const initial = { completedLessonIds: [], currentLessonId: 'lesson-scd-type-2' }
    expect(topicProgress(initial, 'historical-dimensions')).toMatchObject({
      completedLessons: 0,
      totalLessons: 1,
      state: 'not_started',
    })

    const completed = { ...initial, completedLessonIds: ['lesson-scd-type-2'] }
    expect(topicProgress(completed, 'historical-dimensions')).toMatchObject({
      completedLessons: 1,
      totalLessons: 1,
      state: 'completed',
    })
  })

  it('projects a multi-Lesson Topic through not_started, in_progress and completed', () => {
    const initial = { completedLessonIds: [], currentLessonId: 'lesson-01' }
    expect(topicProgress(initial, 'warehouse-mental-model')).toMatchObject({
      completedLessons: 0,
      totalLessons: 2,
      state: 'not_started',
    })

    const partial = { ...initial, completedLessonIds: ['lesson-01'] }
    expect(topicProgress(partial, 'warehouse-mental-model')).toMatchObject({
      completedLessons: 1,
      totalLessons: 2,
      state: 'in_progress',
    })

    const complete = {
      ...initial,
      completedLessonIds: ['lesson-01', 'lesson-01-terms'],
    }
    expect(topicProgress(complete, 'warehouse-mental-model')).toMatchObject({
      completedLessons: 2,
      totalLessons: 2,
      state: 'completed',
    })
  })

  it('uses Stage available Lesson counts, including optional synthesis Lessons', () => {
    const progress = { completedLessonIds: ['lesson-12'], currentLessonId: 'lesson-12' }
    const stage = stageProgress(progress, 'serving-production')

    expect(stage.totalLessons).toBe(12)
    expect(stage.completedLessons).toBe(1)
    expect(stage.progress).toBeCloseTo((1 / 12) * 100)
    expect(topicProgress(progress, 'capstone-delivery').state).toBe('completed')
  })

  it('resolves current Lesson → canonical Topic → Stage', () => {
    const projection = projectLearningProgress({
      completedLessonIds: [],
      currentLessonId: 'lesson-13-1',
    })

    expect(projection.current).toEqual({
      currentLessonId: 'lesson-13-1',
      topicId: 'production-lifecycle-debugging',
      stageId: 'serving-production',
    })
  })

  it('does not let recommendedPrior, relatedTopics, kind or optional change progress', () => {
    const progress = {
      completedLessonIds: ['lesson-01', 'lesson-12', 'lesson-13-1'],
      currentLessonId: 'lesson-13-1',
    }
    const modified = cloneGraph()
    const topic = modified.topics.find(({ id }) => id === 'capstone-delivery')!
    topic.recommendedPrior = ['production-lifecycle-debugging']
    topic.relatedTopics = ['warehouse-mental-model']
    topic.kind = 'concept'
    topic.optional = false

    expect(projectLearningProgress(progress, modified)).toEqual(
      projectLearningProgress(progress, learningGraph),
    )
  })
})
