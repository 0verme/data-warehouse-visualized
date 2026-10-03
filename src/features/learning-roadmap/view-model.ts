import type { Lesson } from '../../data/course'
import { getLearningTopicTitle, learningStageTitles } from './presentation'
import type { LearningGraph, LearningStageId, RequiredEdgeReason } from './types'

export interface RoadmapLessonView {
  id: string
  title: string
  href: string
}

export interface RoadmapTopicRelationView {
  id: string
  title: string
  href: string
  reason?: string
}

export interface RoadmapTopicView {
  id: string
  anchorId: string
  title: string
  stageId: LearningStageId
  kind: 'concept' | 'synthesis' | 'case'
  optional: boolean
  lessons: RoadmapLessonView[]
  requiredPrerequisites: RoadmapTopicRelationView[]
  recommendedPrior: RoadmapTopicRelationView[]
  relatedTopics: RoadmapTopicRelationView[]
}

export interface RoadmapStageView {
  id: LearningStageId
  order: number
  title: string
  topics: RoadmapTopicView[]
}

export interface RoadmapViewModel {
  stages: RoadmapStageView[]
}

function topicAnchorId(topicId: string): string {
  return `roadmap-topic-${topicId}`
}

function edgeKey(fromTopicId: string, toTopicId: string): string {
  return JSON.stringify([fromTopicId, toTopicId])
}

/**
 * Projects the frozen graph into page-ready groups. Course copy and routes are joined
 * from the supplied course registry; no progress or relationship state is created here.
 */
export function buildRoadmapViewModel(
  graph: LearningGraph,
  availableLessons: readonly Lesson[],
  requiredEdgeReasons: readonly RequiredEdgeReason[],
  getLessonHref: (slug: string) => string,
): RoadmapViewModel {
  const topicById = new Map(graph.topics.map((topic) => [topic.id, topic]))
  const lessonById = new Map(availableLessons.map((lesson) => [lesson.id, lesson]))
  const lessonOrder = new Map(availableLessons.map((lesson, index) => [lesson.id, index]))
  const requiredReasonByEdge = new Map(
    requiredEdgeReasons.map((edge) => [edgeKey(edge.fromTopicId, edge.toTopicId), edge.reason]),
  )
  const stageIds = new Set(graph.stages.map(({ id }) => id))

  for (const topic of graph.topics) {
    if (!stageIds.has(topic.stageId)) {
      throw new Error(`Unknown Roadmap Stage "${topic.stageId}" for Topic "${topic.id}"`)
    }
  }

  const topicsByStage = new Map<LearningStageId, RoadmapTopicView[]>(
    graph.stages.map(({ id }) => [id, []]),
  )

  function relation(topicId: string, reason?: string): RoadmapTopicRelationView {
    const topic = topicById.get(topicId)
    if (!topic) throw new Error(`Unknown Roadmap Topic reference "${topicId}"`)

    return {
      id: topic.id,
      title: getLearningTopicTitle(topic.id),
      href: `#${topicAnchorId(topic.id)}`,
      ...(reason ? { reason } : {}),
    }
  }

  for (const topic of graph.topics) {
    const lessons = topic.lessonIds
      .map((lessonId) => {
        const lesson = lessonById.get(lessonId)
        if (!lesson) {
          throw new Error(`Missing available course metadata for Lesson "${lessonId}"`)
        }
        return lesson
      })
      .sort((left, right) => (lessonOrder.get(left.id) ?? 0) - (lessonOrder.get(right.id) ?? 0))
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        href: getLessonHref(lesson.slug),
      }))

    const requiredPrerequisites = topic.prerequisites.map((topicId) =>
      relation(topicId, requiredReasonByEdge.get(edgeKey(topicId, topic.id))),
    )
    const recommendedPrior = (topic.recommendedPrior ?? []).map((topicId) => relation(topicId))
    const relatedTopics = (topic.relatedTopics ?? []).map((topicId) => relation(topicId))
    const stageTopics = topicsByStage.get(topic.stageId)
    if (!stageTopics) throw new Error(`Missing Roadmap Stage "${topic.stageId}"`)

    stageTopics.push({
      id: topic.id,
      anchorId: topicAnchorId(topic.id),
      title: getLearningTopicTitle(topic.id),
      stageId: topic.stageId,
      kind: topic.kind ?? 'concept',
      optional: topic.optional ?? false,
      lessons,
      requiredPrerequisites,
      recommendedPrior,
      relatedTopics,
    })
  }

  return {
    stages: [...graph.stages]
      .sort((left, right) => left.order - right.order)
      .map((stage) => ({
        id: stage.id,
        order: stage.order,
        title: learningStageTitles[stage.id],
        topics: topicsByStage.get(stage.id) ?? [],
      })),
  }
}
