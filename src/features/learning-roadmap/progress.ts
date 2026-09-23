import { isLessonAvailable, lessonDefinitions } from '../../data/course'
import type { ProgressState } from '../../utils/progress'
import { learningGraph } from './graph'
import type { LearningGraph, LearningStageId } from './types'

export type TopicProgressState = 'not_started' | 'in_progress' | 'completed'

export interface TopicProgress {
  topicId: string
  completedLessons: number
  totalLessons: number
  state: TopicProgressState
}

export interface StageProgress {
  stageId: LearningStageId
  completedLessons: number
  totalLessons: number
  /** Completed available Lessons as a percentage from 0 to 100. */
  progress: number
}

export interface CurrentLearningLocation {
  currentLessonId: string
  topicId: string | null
  stageId: LearningStageId | null
}

export interface LearningProgressProjection {
  topics: TopicProgress[]
  stages: StageProgress[]
  current: CurrentLearningLocation
}

const availableLessonIds = new Set(lessonDefinitions.filter(isLessonAvailable).map(({ id }) => id))

/** Projects existing Lesson completion to Topic/Stage and resolves the current Lesson location. */
export function projectLearningProgress(
  progress: ProgressState,
  graph: LearningGraph = learningGraph,
): LearningProgressProjection {
  const completedLessonIds = new Set(progress.completedLessonIds)
  const topics = graph.topics.map((topic): TopicProgress => {
    const lessonIds = new Set(
      topic.lessonIds.filter((lessonId) => availableLessonIds.has(lessonId)),
    )
    const completedLessons = [...lessonIds].filter((lessonId) =>
      completedLessonIds.has(lessonId),
    ).length
    const totalLessons = lessonIds.size
    const state: TopicProgressState =
      completedLessons === 0
        ? 'not_started'
        : completedLessons === totalLessons
          ? 'completed'
          : 'in_progress'

    return {
      topicId: topic.id,
      completedLessons,
      totalLessons,
      state,
    }
  })

  const stageLessons = new Map<LearningStageId, Set<string>>()
  for (const stage of graph.stages) stageLessons.set(stage.id, new Set())
  for (const topic of graph.topics) {
    const lessonIds = stageLessons.get(topic.stageId)
    if (!lessonIds) continue
    for (const lessonId of topic.lessonIds) {
      if (availableLessonIds.has(lessonId)) lessonIds.add(lessonId)
    }
  }
  const stages = [...graph.stages]
    .sort((left, right) => left.order - right.order)
    .map((stage): StageProgress => {
      const lessonIds = stageLessons.get(stage.id) ?? new Set<string>()
      const completedLessons = [...lessonIds].filter((lessonId) =>
        completedLessonIds.has(lessonId),
      ).length
      const totalLessons = lessonIds.size

      return {
        stageId: stage.id,
        completedLessons,
        totalLessons,
        progress: totalLessons === 0 ? 0 : (completedLessons / totalLessons) * 100,
      }
    })

  const currentTopic = graph.topics.find((topic) =>
    topic.lessonIds.some((lessonId) => lessonId === progress.currentLessonId),
  )
  const currentStage = graph.stages.find((stage) => stage.id === currentTopic?.stageId)

  return {
    topics,
    stages,
    current: {
      currentLessonId: progress.currentLessonId,
      topicId: currentTopic?.id ?? null,
      stageId: currentStage?.id ?? null,
    },
  }
}
