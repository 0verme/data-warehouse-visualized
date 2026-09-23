import { isLessonAvailable, lessonDefinitions, type LessonDefinition } from '../../data/course'
import { sortLessons } from '../../utils/lesson'
import { learningGraph, prerequisiteInversionReviews, requiredEdgeReasons } from './graph'
import type {
  LearningGraph,
  LearningPath,
  PrerequisiteInversionReview,
  RequiredEdgeReason,
} from './types'

export type LearningGraphValidationErrorCode =
  | 'unsupported-version'
  | 'duplicate-stage-id'
  | 'duplicate-stage-order'
  | 'unknown-stage'
  | 'duplicate-topic-id'
  | 'empty-topic'
  | 'duplicate-topic-lesson'
  | 'unknown-lesson'
  | 'unavailable-lesson'
  | 'missing-lesson-owner'
  | 'duplicate-canonical-owner'
  | 'unknown-topic-reference'
  | 'self-edge'
  | 'duplicate-edge'
  | 'duplicate-related-reference'
  | 'unknown-path-topic-reference'
  | 'duplicate-path-topic-reference'
  | 'missing-required-edge-reason'
  | 'duplicate-required-edge-reason'
  | 'unknown-reason-topic-reference'
  | 'empty-required-edge-reason'
  | 'reason-for-non-required-edge'
  | 'duplicate-inversion-review'
  | 'unknown-inversion-review-reference'
  | 'empty-inversion-review-reason'
  | 'removed-edge-still-declared'
  | 'review-for-non-inversion'
  | 'unreviewed-prerequisite-inversion'
  | 'required-cycle'
  | 'orphan-topic'

export interface LearningGraphValidationError {
  code: LearningGraphValidationErrorCode
  message: string
}

export interface LearningGraphValidationSummary {
  stageCount: number
  topicCount: number
  availableLessonCount: number
  coveredAvailableLessonCount: number
  requiredEdgeCount: number
  recommendedEdgeCount: number
  relatedReferenceCount: number
  requiredReasonFixtureCount: number
  duplicateOwnerCount: number
  unknownLessonCount: number
  unknownReferenceCount: number
  emptyTopicCount: number
  selfEdgeCount: number
  duplicateEdgeCount: number
  cycleCount: number
  requiredRootCount: number
  orphanTopicCount: number
  unreviewedInversionCount: number
}

export interface LearningGraphValidationResult {
  valid: boolean
  errors: LearningGraphValidationError[]
  summary: LearningGraphValidationSummary
}

export interface LearningGraphValidationOptions {
  graph?: LearningGraph
  lessons?: readonly LessonDefinition[]
  requiredEdgeReasons?: readonly RequiredEdgeReason[]
  inversionReviews?: readonly PrerequisiteInversionReview[]
  paths?: readonly LearningPath[]
}

type EdgeStrength = 'required' | 'recommended'

interface DeclaredEdge {
  fromTopicId: string
  toTopicId: string
  strength: EdgeStrength
}

function pairKey(fromTopicId: string, toTopicId: string): string {
  return JSON.stringify([fromTopicId, toTopicId])
}

/** Validates the v1 graph against the course registry and its audited fixtures. */
export function validateLearningGraph(
  options: LearningGraphValidationOptions = {},
): LearningGraphValidationResult {
  const graph = options.graph ?? learningGraph
  const lessons = options.lessons ?? lessonDefinitions
  const reasons = options.requiredEdgeReasons ?? requiredEdgeReasons
  const inversionReviews = options.inversionReviews ?? prerequisiteInversionReviews
  const paths = options.paths ?? []
  const errors: LearningGraphValidationError[] = []
  const summary: LearningGraphValidationSummary = {
    stageCount: graph.stages.length,
    topicCount: graph.topics.length,
    availableLessonCount: 0,
    coveredAvailableLessonCount: 0,
    requiredEdgeCount: 0,
    recommendedEdgeCount: 0,
    relatedReferenceCount: 0,
    requiredReasonFixtureCount: reasons.length,
    duplicateOwnerCount: 0,
    unknownLessonCount: 0,
    unknownReferenceCount: 0,
    emptyTopicCount: 0,
    selfEdgeCount: 0,
    duplicateEdgeCount: 0,
    cycleCount: 0,
    requiredRootCount: 0,
    orphanTopicCount: 0,
    unreviewedInversionCount: 0,
  }
  const addError = (code: LearningGraphValidationErrorCode, message: string): void => {
    errors.push({ code, message })
  }

  if (graph.version !== 1) {
    addError('unsupported-version', `Expected graph version 1, received ${graph.version}.`)
  }

  const stageIds = new Set<string>()
  const stageOrders = new Set<number>()
  for (const stage of graph.stages) {
    if (stageIds.has(stage.id)) {
      addError('duplicate-stage-id', `Stage ID "${stage.id}" is declared more than once.`)
    }
    if (stageOrders.has(stage.order)) {
      addError('duplicate-stage-order', `Stage order "${stage.order}" is assigned more than once.`)
    }
    stageIds.add(stage.id)
    stageOrders.add(stage.order)
  }

  const topicIds = new Set<string>()
  const firstTopicById = new Map<string, LearningGraph['topics'][number]>()
  for (const topic of graph.topics) {
    if (topicIds.has(topic.id)) {
      addError('duplicate-topic-id', `Topic ID "${topic.id}" is declared more than once.`)
    } else {
      topicIds.add(topic.id)
      firstTopicById.set(topic.id, topic)
    }
    if (!stageIds.has(topic.stageId)) {
      summary.unknownReferenceCount += 1
      addError('unknown-stage', `Topic "${topic.id}" references unknown Stage "${topic.stageId}".`)
    }
    if (topic.lessonIds.length === 0) {
      summary.emptyTopicCount += 1
      addError('empty-topic', `Topic "${topic.id}" has no Lessons.`)
    }
  }

  const allLessonById = new Map<string, LessonDefinition>()
  for (const lesson of lessons) {
    if (!allLessonById.has(lesson.id)) {
      allLessonById.set(lesson.id, lesson)
    }
  }
  const availableLessons = lessons.filter(isLessonAvailable)
  const availableLessonIds = new Set(availableLessons.map(({ id }) => id))
  summary.availableLessonCount = availableLessonIds.size

  const ownerIndexesByLesson = new Map<string, Set<number>>()
  const unknownLessonIds = new Set<string>()
  const declaredEdges: DeclaredEdge[] = []
  const requiredAdjacency = new Map<string, Set<string>>()
  const requiredTargets = new Set<string>()

  graph.topics.forEach((topic, topicIndex) => {
    const lessonIdsInTopic = new Set<string>()
    for (const lessonId of topic.lessonIds) {
      if (lessonIdsInTopic.has(lessonId)) {
        addError(
          'duplicate-topic-lesson',
          `Topic "${topic.id}" lists Lesson "${lessonId}" more than once.`,
        )
        continue
      }
      lessonIdsInTopic.add(lessonId)

      if (!allLessonById.has(lessonId)) {
        unknownLessonIds.add(lessonId)
        addError('unknown-lesson', `Topic "${topic.id}" references unknown Lesson "${lessonId}".`)
        continue
      }
      if (!availableLessonIds.has(lessonId)) {
        addError('unavailable-lesson', `Topic "${topic.id}" owns unavailable Lesson "${lessonId}".`)
        continue
      }
      const owners = ownerIndexesByLesson.get(lessonId) ?? new Set<number>()
      owners.add(topicIndex)
      ownerIndexesByLesson.set(lessonId, owners)
    }

    const relationGroups: Array<{
      strength: EdgeStrength | 'related'
      references: readonly string[]
    }> = [
      { strength: 'required', references: topic.prerequisites },
      { strength: 'recommended', references: topic.recommendedPrior ?? [] },
      { strength: 'related', references: topic.relatedTopics ?? [] },
    ]

    for (const { strength, references } of relationGroups) {
      const localReferences = new Set<string>()
      for (const fromTopicId of references) {
        if (localReferences.has(fromTopicId)) {
          if (strength === 'related') {
            addError(
              'duplicate-related-reference',
              `Topic "${topic.id}" repeats related Topic "${fromTopicId}".`,
            )
          }
        }
        localReferences.add(fromTopicId)

        if (fromTopicId === topic.id) {
          summary.selfEdgeCount += 1
          addError('self-edge', `Topic "${topic.id}" references itself as ${strength}.`)
        }
        if (!topicIds.has(fromTopicId)) {
          summary.unknownReferenceCount += 1
          addError(
            'unknown-topic-reference',
            `Topic "${topic.id}" references unknown Topic "${fromTopicId}" in ${strength}.`,
          )
        }

        if (strength === 'required') {
          summary.requiredEdgeCount += 1
          declaredEdges.push({ fromTopicId, toTopicId: topic.id, strength })
          if (topicIds.has(fromTopicId) && fromTopicId !== topic.id) {
            const outgoing = requiredAdjacency.get(fromTopicId) ?? new Set<string>()
            outgoing.add(topic.id)
            requiredAdjacency.set(fromTopicId, outgoing)
            requiredTargets.add(topic.id)
          }
        } else if (strength === 'recommended') {
          summary.recommendedEdgeCount += 1
          declaredEdges.push({ fromTopicId, toTopicId: topic.id, strength })
        } else {
          summary.relatedReferenceCount += 1
        }
      }
    }
  })
  summary.unknownLessonCount = unknownLessonIds.size

  for (const lessonId of availableLessonIds) {
    const ownerCount = ownerIndexesByLesson.get(lessonId)?.size ?? 0
    if (ownerCount === 0) {
      addError('missing-lesson-owner', `Available Lesson "${lessonId}" has no canonical Topic.`)
    } else if (ownerCount > 1) {
      summary.duplicateOwnerCount += 1
      addError(
        'duplicate-canonical-owner',
        `Available Lesson "${lessonId}" belongs to ${ownerCount} Topics.`,
      )
    } else {
      summary.coveredAvailableLessonCount += 1
    }
  }

  const edgeDeclarationsByPair = new Map<string, DeclaredEdge[]>()
  const requiredPairKeys = new Set<string>()
  const recommendedPairKeys = new Set<string>()
  for (const edge of declaredEdges) {
    const key = pairKey(edge.fromTopicId, edge.toTopicId)
    const declarations = edgeDeclarationsByPair.get(key) ?? []
    declarations.push(edge)
    edgeDeclarationsByPair.set(key, declarations)
    if (edge.strength === 'required') requiredPairKeys.add(key)
    if (edge.strength === 'recommended') recommendedPairKeys.add(key)
  }
  for (const [key, declarations] of edgeDeclarationsByPair) {
    if (declarations.length > 1) {
      summary.duplicateEdgeCount += 1
      const [fromTopicId, toTopicId] = JSON.parse(key) as [string, string]
      const strengths = [...new Set(declarations.map(({ strength }) => strength))].join(' + ')
      addError(
        'duplicate-edge',
        `Ordered pair "${fromTopicId}" → "${toTopicId}" is declared more than once (${strengths}).`,
      )
    }
  }

  const requiredPairsWithReason = new Map<string, RequiredEdgeReason[]>()
  for (const reasonFixture of reasons) {
    const key = pairKey(reasonFixture.fromTopicId, reasonFixture.toTopicId)
    const sourceExists = topicIds.has(reasonFixture.fromTopicId)
    const targetExists = topicIds.has(reasonFixture.toTopicId)
    if (!sourceExists || !targetExists) {
      summary.unknownReferenceCount += Number(!sourceExists) + Number(!targetExists)
      addError(
        'unknown-reason-topic-reference',
        `Reason fixture references unknown endpoint "${reasonFixture.fromTopicId}" → "${reasonFixture.toTopicId}".`,
      )
    }
    if (!reasonFixture.reason.trim()) {
      addError(
        'empty-required-edge-reason',
        `Reason for "${reasonFixture.fromTopicId}" → "${reasonFixture.toTopicId}" is empty.`,
      )
    }
    if (!requiredPairKeys.has(key)) {
      addError(
        'reason-for-non-required-edge',
        `Reason fixture "${reasonFixture.fromTopicId}" → "${reasonFixture.toTopicId}" does not match a required edge.`,
      )
    }
    const fixtures = requiredPairsWithReason.get(key) ?? []
    fixtures.push(reasonFixture)
    requiredPairsWithReason.set(key, fixtures)
  }
  for (const key of requiredPairKeys) {
    const fixtures = requiredPairsWithReason.get(key) ?? []
    const [fromTopicId, toTopicId] = JSON.parse(key) as [string, string]
    if (fixtures.length === 0) {
      addError(
        'missing-required-edge-reason',
        `Required edge "${fromTopicId}" → "${toTopicId}" has no reason fixture.`,
      )
    } else if (fixtures.length > 1) {
      addError(
        'duplicate-required-edge-reason',
        `Required edge "${fromTopicId}" → "${toTopicId}" has ${fixtures.length} reason fixtures.`,
      )
    }
  }

  const coursePositionByLessonId = new Map(
    sortLessons(lessons).map((lesson, index) => [lesson.id, index] as const),
  )
  const getPositions = (topicId: string): number[] => {
    const topic = firstTopicById.get(topicId)
    if (!topic) return []
    return [...new Set(topic.lessonIds)]
      .filter((lessonId) => availableLessonIds.has(lessonId))
      .map((lessonId) => coursePositionByLessonId.get(lessonId))
      .filter((position): position is number => position !== undefined)
  }
  const inversionCandidates = new Set<string>()
  for (const key of requiredPairKeys) {
    const [fromTopicId, toTopicId] = JSON.parse(key) as [string, string]
    const sourcePositions = getPositions(fromTopicId)
    const targetPositions = getPositions(toTopicId)
    if (
      sourcePositions.length > 0 &&
      targetPositions.length > 0 &&
      Math.min(...sourcePositions) > Math.max(...targetPositions)
    ) {
      inversionCandidates.add(key)
    }
  }

  const reviewByPair = new Map<string, PrerequisiteInversionReview[]>()
  for (const review of inversionReviews) {
    const key = pairKey(review.fromTopicId, review.toTopicId)
    const fixtures = reviewByPair.get(key) ?? []
    fixtures.push(review)
    reviewByPair.set(key, fixtures)

    const sourceExists = topicIds.has(review.fromTopicId)
    const targetExists = topicIds.has(review.toTopicId)
    if (!sourceExists || !targetExists) {
      summary.unknownReferenceCount += Number(!sourceExists) + Number(!targetExists)
      addError(
        'unknown-inversion-review-reference',
        `Inversion review references unknown endpoint "${review.fromTopicId}" → "${review.toTopicId}".`,
      )
    }
    if (!review.reason.trim()) {
      addError(
        'empty-inversion-review-reason',
        `Inversion review for "${review.fromTopicId}" → "${review.toTopicId}" has no reason.`,
      )
    }
    if (review.disposition === 'removed') {
      if (requiredPairKeys.has(key) || recommendedPairKeys.has(key)) {
        addError(
          'removed-edge-still-declared',
          `Reviewed-removed edge "${review.fromTopicId}" → "${review.toTopicId}" is still declared.`,
        )
      }
    } else if (review.disposition === 'accepted' && !inversionCandidates.has(key)) {
      addError(
        'review-for-non-inversion',
        `Accepted inversion review "${review.fromTopicId}" → "${review.toTopicId}" is not an active inversion candidate.`,
      )
    }
  }
  for (const [key, fixtures] of reviewByPair) {
    if (fixtures.length > 1) {
      const [fromTopicId, toTopicId] = JSON.parse(key) as [string, string]
      addError(
        'duplicate-inversion-review',
        `Inversion pair "${fromTopicId}" → "${toTopicId}" has ${fixtures.length} review fixtures.`,
      )
    }
  }
  for (const key of inversionCandidates) {
    const [fromTopicId, toTopicId] = JSON.parse(key) as [string, string]
    const reviews = reviewByPair.get(key) ?? []
    const acceptedReview = reviews.filter(
      ({ disposition, reason }) => disposition === 'accepted' && reason.trim().length > 0,
    )
    if (acceptedReview.length !== 1) {
      summary.unreviewedInversionCount += 1
      addError(
        'unreviewed-prerequisite-inversion',
        `Required edge "${fromTopicId}" → "${toTopicId}" is later-to-earlier by course position and needs exactly one accepted review.`,
      )
    }
  }

  const cycleSignatures = new Set<string>()
  const visitState = new Map<string, 0 | 1 | 2>()
  const visitStack: string[] = []
  const visit = (topicId: string): void => {
    visitState.set(topicId, 1)
    visitStack.push(topicId)
    for (const nextTopicId of requiredAdjacency.get(topicId) ?? []) {
      if (visitState.get(nextTopicId) === 1) {
        const startIndex = visitStack.lastIndexOf(nextTopicId)
        const cycle = visitStack.slice(startIndex)
        cycleSignatures.add([...cycle].sort().join('|'))
      } else if (!visitState.has(nextTopicId)) {
        visit(nextTopicId)
      }
    }
    visitStack.pop()
    visitState.set(topicId, 2)
  }
  for (const topicId of topicIds) {
    if (!visitState.has(topicId)) visit(topicId)
  }
  summary.cycleCount = cycleSignatures.size
  for (const cycle of cycleSignatures) {
    addError('required-cycle', `Required prerequisite cycle detected among: ${cycle}.`)
  }

  const requiredRoots = [...topicIds].filter((topicId) => !requiredTargets.has(topicId))
  summary.requiredRootCount = requiredRoots.length
  const reachableFromRoot = new Set<string>()
  const markReachable = (topicId: string): void => {
    if (reachableFromRoot.has(topicId)) return
    reachableFromRoot.add(topicId)
    for (const nextTopicId of requiredAdjacency.get(topicId) ?? []) markReachable(nextTopicId)
  }
  for (const rootTopicId of requiredRoots) markReachable(rootTopicId)
  for (const topicId of topicIds) {
    if (!reachableFromRoot.has(topicId)) {
      summary.orphanTopicCount += 1
      addError('orphan-topic', `Topic "${topicId}" is unreachable from every required-graph root.`)
    }
  }

  for (const path of paths) {
    for (const [field, references] of [
      ['entryTopicIds', path.entryTopicIds],
      ['highlightTopicIds', path.highlightTopicIds],
    ] as const) {
      const seen = new Set<string>()
      for (const topicId of references) {
        if (!topicIds.has(topicId)) {
          summary.unknownReferenceCount += 1
          addError(
            'unknown-path-topic-reference',
            `LearningPath "${path.id}" ${field} references unknown Topic "${topicId}".`,
          )
        }
        if (seen.has(topicId)) {
          addError(
            'duplicate-path-topic-reference',
            `LearningPath "${path.id}" repeats Topic "${topicId}" in ${field}.`,
          )
        }
        seen.add(topicId)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    summary,
  }
}
