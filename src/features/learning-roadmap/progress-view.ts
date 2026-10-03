import type { LearningProgressProjection, StageProgress, TopicProgressState } from './progress'

export interface RoadmapTopicProgressView {
  topicId: string
  state: TopicProgressState
  label: string
  completedLessons: number
  totalLessons: number
  isCurrent: boolean
}

export interface RoadmapStageProgressView {
  stageId: string
  label: string
  /** Rounded 0–100 percentage derived from the existing StageProgress.progress. */
  percent: number
  completedLessons: number
  totalLessons: number
  isCurrent: boolean
}

export interface RoadmapCurrentLocationView {
  lessonId: string
  topicId: string
  stageId: string
}

export interface RoadmapProgressView {
  topics: RoadmapTopicProgressView[]
  stages: RoadmapStageProgressView[]
  current: RoadmapCurrentLocationView | null
}

/** Topic status copy only reflects mapped Lesson completion, never mastery or mastery-like scoring. */
export function formatTopicProgressLabel(
  state: TopicProgressState,
  completedLessons: number,
  totalLessons: number,
): string {
  if (state === 'completed') return `已完成 · ${completedLessons} / ${totalLessons}`
  if (state === 'in_progress') return `学习中 · ${completedLessons} / ${totalLessons}`
  return '未开始'
}

/** Stage copy uses the Stage's available-Lesson denominator from StageProgress, not Topic counts. */
export function formatStageProgressLabel(stage: StageProgress): string {
  return `${stage.completedLessons} / ${stage.totalLessons} 节 · ${clampPercent(stage.progress)}%`
}

export function clampPercent(progress: number): number {
  if (!Number.isFinite(progress)) return 0
  return Math.min(100, Math.max(0, Math.round(progress)))
}

/**
 * Joins the Phase 0 Lesson→Topic→Stage projection with Roadmap copy.
 * Pure: no storage, no DOM, no second progress model.
 */
export function buildRoadmapProgressView(
  projection: LearningProgressProjection,
): RoadmapProgressView {
  const { current } = projection
  const resolvedCurrent: RoadmapCurrentLocationView | null =
    current.topicId && current.stageId
      ? {
          lessonId: current.currentLessonId,
          topicId: current.topicId,
          stageId: current.stageId,
        }
      : null

  return {
    topics: projection.topics.map((topic) => ({
      topicId: topic.topicId,
      state: topic.state,
      label: formatTopicProgressLabel(topic.state, topic.completedLessons, topic.totalLessons),
      completedLessons: topic.completedLessons,
      totalLessons: topic.totalLessons,
      isCurrent: resolvedCurrent?.topicId === topic.topicId,
    })),
    stages: projection.stages.map((stage) => ({
      stageId: stage.stageId,
      label: formatStageProgressLabel(stage),
      percent: clampPercent(stage.progress),
      completedLessons: stage.completedLessons,
      totalLessons: stage.totalLessons,
      isCurrent: resolvedCurrent?.stageId === stage.stageId,
    })),
    current: resolvedCurrent,
  }
}
