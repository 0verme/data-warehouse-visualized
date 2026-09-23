import type { LessonId } from '../../data/course'

export type LearningStageId =
  | 'foundation'
  | 'modeling'
  | 'metrics'
  | 'transformation'
  | 'orchestration'
  | 'trust-traceability'
  | 'governance-architecture'
  | 'serving-production'

export interface LearningStage {
  id: LearningStageId
  order: number
}

export interface LearningTopic {
  id: string
  stageId: LearningStageId
  lessonIds: LessonId[]

  prerequisites: string[]
  recommendedPrior?: string[]
  relatedTopics?: string[]

  kind?: 'concept' | 'synthesis' | 'case'
  optional?: boolean
}

export interface LearningGraph {
  version: 1
  stages: LearningStage[]
  topics: LearningTopic[]
}

export interface LearningPath {
  id: string
  entryTopicIds: string[]
  highlightTopicIds: string[]
}

export interface RequiredEdgeReason {
  fromTopicId: string
  toTopicId: string
  reason: string
}

export interface PrerequisiteInversionReview {
  fromTopicId: string
  toTopicId: string
  disposition: 'accepted' | 'removed'
  reason: string
}
