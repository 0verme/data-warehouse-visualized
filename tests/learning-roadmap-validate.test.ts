import { describe, expect, it } from 'vitest'
import { lessonDefinitions, type LessonDefinition } from '../src/data/course'
import { learningGraph, requiredEdgeReasons } from '../src/features/learning-roadmap/graph'
import type {
  LearningGraph,
  LearningPath,
  LearningStageId,
  RequiredEdgeReason,
} from '../src/features/learning-roadmap/types'
import { validateLearningGraph } from '../src/features/learning-roadmap/validate'

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

function getTopic(graph: LearningGraph, id: string) {
  const topic = graph.topics.find((candidate) => candidate.id === id)
  if (!topic) throw new Error(`Missing test Topic: ${id}`)
  return topic
}

function errorCodes(result: ReturnType<typeof validateLearningGraph>): string[] {
  return result.errors.map(({ code }) => code)
}

function makeInversionGraph(): LearningGraph {
  return {
    version: 1,
    stages: [{ id: 'foundation', order: 1 }],
    topics: [
      {
        id: 'late-source',
        stageId: 'foundation',
        lessonIds: ['lesson-12'],
        prerequisites: [],
      },
      {
        id: 'early-target',
        stageId: 'foundation',
        lessonIds: ['lesson-01'],
        prerequisites: ['late-source'],
      },
    ],
  }
}

const inversionReason: RequiredEdgeReason = {
  fromTopicId: 'late-source',
  toTopicId: 'early-target',
  reason: '仅供 validator inversion 测试使用。',
}
const inversionLessons = [
  lessonDefinitions.find(({ id }) => id === 'lesson-01')!,
  lessonDefinitions.find(({ id }) => id === 'lesson-12')!,
] as LessonDefinition[]

describe('Learning Graph validator', () => {
  it('detects duplicate Stage IDs and orders', () => {
    const duplicateId = cloneGraph()
    duplicateId.stages.push({ ...duplicateId.stages[0] })
    expect(errorCodes(validateLearningGraph({ graph: duplicateId }))).toContain(
      'duplicate-stage-id',
    )

    const duplicateOrder = cloneGraph()
    duplicateOrder.stages[1].order = duplicateOrder.stages[0].order
    expect(errorCodes(validateLearningGraph({ graph: duplicateOrder }))).toContain(
      'duplicate-stage-order',
    )

    const duplicateTopic = cloneGraph()
    duplicateTopic.topics[1].id = duplicateTopic.topics[0].id
    expect(errorCodes(validateLearningGraph({ graph: duplicateTopic }))).toContain(
      'duplicate-topic-id',
    )
  })

  it('detects unknown Stage, prerequisite, recommended and related references', () => {
    const unknownStage = cloneGraph()
    unknownStage.topics[0].stageId = 'unknown-stage' as LearningStageId
    expect(errorCodes(validateLearningGraph({ graph: unknownStage }))).toContain('unknown-stage')

    const unknownPrerequisite = cloneGraph()
    getTopic(unknownPrerequisite, 'data-flow-and-layers').prerequisites.push('unknown-topic')
    expect(errorCodes(validateLearningGraph({ graph: unknownPrerequisite }))).toContain(
      'unknown-topic-reference',
    )

    const unknownRecommended = cloneGraph()
    getTopic(unknownRecommended, 'transformation-planning-and-cleaning').recommendedPrior?.push(
      'unknown-topic',
    )
    expect(errorCodes(validateLearningGraph({ graph: unknownRecommended }))).toContain(
      'unknown-topic-reference',
    )

    const unknownRelated = cloneGraph()
    getTopic(unknownRelated, 'grain-safe-joins-and-layered-output').relatedTopics?.push(
      'unknown-topic',
    )
    expect(errorCodes(validateLearningGraph({ graph: unknownRelated }))).toContain(
      'unknown-topic-reference',
    )
  })

  it('detects missing, duplicated, unknown and unavailable Lesson ownership', () => {
    const unknownLesson = cloneGraph()
    getTopic(unknownLesson, 'warehouse-mental-model').lessonIds.push(
      'unknown-lesson' as (typeof learningGraph.topics)[number]['lessonIds'][number],
    )
    expect(errorCodes(validateLearningGraph({ graph: unknownLesson }))).toContain('unknown-lesson')

    const duplicateOwner = cloneGraph()
    getTopic(duplicateOwner, 'data-flow-and-layers').lessonIds.push('lesson-01')
    const duplicateResult = validateLearningGraph({ graph: duplicateOwner })
    expect(duplicateResult.summary.duplicateOwnerCount).toBe(1)
    expect(errorCodes(duplicateResult)).toContain('duplicate-canonical-owner')

    const missingOwner = cloneGraph()
    getTopic(missingOwner, 'warehouse-mental-model').lessonIds = ['lesson-01']
    expect(errorCodes(validateLearningGraph({ graph: missingOwner }))).toContain(
      'missing-lesson-owner',
    )

    const unavailableLesson = cloneGraph()
    getTopic(unavailableLesson, 'warehouse-mental-model').lessonIds[0] = 'lesson-02'
    const comingSoonLessons = lessonDefinitions.map((lesson) =>
      lesson.id === 'lesson-02' ? { ...lesson, demo: 'coming-soon' as const } : lesson,
    )
    expect(
      errorCodes(validateLearningGraph({ graph: unavailableLesson, lessons: comingSoonLessons })),
    ).toContain('unavailable-lesson')

    const unavailablePredecessor: LearningGraph = {
      version: 1,
      stages: [{ id: 'foundation', order: 1 }],
      topics: [
        {
          id: 'unavailable-source',
          stageId: 'foundation',
          lessonIds: ['lesson-02'],
          prerequisites: [],
        },
        {
          id: 'available-target',
          stageId: 'foundation',
          lessonIds: ['lesson-12'],
          prerequisites: ['unavailable-source'],
        },
      ],
    }
    const sourceLesson = lessonDefinitions.find(({ id }) => id === 'lesson-02')!
    const targetLesson = lessonDefinitions.find(({ id }) => id === 'lesson-12')!
    const predecessorResult = validateLearningGraph({
      graph: unavailablePredecessor,
      lessons: [{ ...sourceLesson, demo: 'coming-soon' }, targetLesson],
      requiredEdgeReasons: [
        {
          fromTopicId: 'unavailable-source',
          toTopicId: 'available-target',
          reason: 'The test edge must not depend on a coming-soon-only Topic.',
        },
      ],
    })
    expect(errorCodes(predecessorResult)).toContain('unavailable-lesson')
  })

  it('detects empty Topics and duplicate Lesson IDs within a Topic', () => {
    const emptyTopic = cloneGraph()
    getTopic(emptyTopic, 'historical-dimensions').lessonIds = []
    const emptyResult = validateLearningGraph({ graph: emptyTopic })
    expect(emptyResult.summary.emptyTopicCount).toBe(1)
    expect(errorCodes(emptyResult)).toContain('empty-topic')

    const duplicateLesson = cloneGraph()
    getTopic(duplicateLesson, 'warehouse-mental-model').lessonIds.push('lesson-01')
    expect(errorCodes(validateLearningGraph({ graph: duplicateLesson }))).toContain(
      'duplicate-topic-lesson',
    )
  })

  it('detects required self edges and duplicate ordered pairs', () => {
    const selfEdge = cloneGraph()
    getTopic(selfEdge, 'warehouse-mental-model').prerequisites.push('warehouse-mental-model')
    const selfResult = validateLearningGraph({ graph: selfEdge })
    expect(selfResult.summary.selfEdgeCount).toBeGreaterThan(0)
    expect(errorCodes(selfResult)).toContain('self-edge')

    const duplicateEdge = cloneGraph()
    getTopic(duplicateEdge, 'data-flow-and-layers').prerequisites.push('warehouse-mental-model')
    const duplicateResult = validateLearningGraph({ graph: duplicateEdge })
    expect(duplicateResult.summary.duplicateEdgeCount).toBe(1)
    expect(errorCodes(duplicateResult)).toContain('duplicate-edge')
  })

  it('rejects the same ordered pair declared as both required and recommended', () => {
    const graph = cloneGraph()
    const topic = getTopic(graph, 'data-flow-and-layers')
    topic.recommendedPrior = ['warehouse-mental-model']

    expect(errorCodes(validateLearningGraph({ graph }))).toContain('duplicate-edge')
  })

  it('detects required cycles without imposing a single-root contract', () => {
    const graph = cloneGraph()
    getTopic(graph, 'warehouse-mental-model').prerequisites.push('data-flow-and-layers')
    const addedReason: RequiredEdgeReason = {
      fromTopicId: 'data-flow-and-layers',
      toTopicId: 'warehouse-mental-model',
      reason: 'test-only reverse edge closes a required cycle.',
    }
    const result = validateLearningGraph({
      graph,
      requiredEdgeReasons: [...requiredEdgeReasons, addedReason],
    })

    expect(result.summary.requiredRootCount).toBeGreaterThan(1)
    expect(result.summary.cycleCount).toBeGreaterThan(0)
    expect(errorCodes(result)).toContain('required-cycle')
  })

  it('reports Topics in a rootless required component as orphans', () => {
    const graph = cloneGraph()
    getTopic(graph, 'delivery-channels').prerequisites.push('data-service-choice')
    const addedReason: RequiredEdgeReason = {
      fromTopicId: 'data-service-choice',
      toTopicId: 'delivery-channels',
      reason: 'test-only reverse edge makes this component rootless.',
    }
    const result = validateLearningGraph({
      graph,
      requiredEdgeReasons: [...requiredEdgeReasons, addedReason],
    })

    expect(result.summary.orphanTopicCount).toBeGreaterThan(0)
    expect(errorCodes(result)).toContain('orphan-topic')
  })

  it('requires exactly one non-empty reason for each required edge', () => {
    const firstReason = requiredEdgeReasons[0]
    const missing = validateLearningGraph({
      requiredEdgeReasons: requiredEdgeReasons.slice(1),
    })
    expect(errorCodes(missing)).toContain('missing-required-edge-reason')

    const duplicate = validateLearningGraph({
      requiredEdgeReasons: [...requiredEdgeReasons, { ...firstReason }],
    })
    expect(errorCodes(duplicate)).toContain('duplicate-required-edge-reason')

    const empty = validateLearningGraph({
      requiredEdgeReasons: requiredEdgeReasons.map((reason, index) =>
        index === 0 ? { ...reason, reason: '  ' } : reason,
      ),
    })
    expect(errorCodes(empty)).toContain('empty-required-edge-reason')
  })

  it('rejects reason fixtures with unknown endpoints or non-required edge pairs', () => {
    const invalidFixtures: RequiredEdgeReason[] = [
      {
        fromTopicId: 'missing-source',
        toTopicId: 'data-flow-and-layers',
        reason: 'unknown source',
      },
      {
        fromTopicId: 'warehouse-mental-model',
        toTopicId: 'missing-target',
        reason: 'unknown target',
      },
      {
        fromTopicId: 'warehouse-mental-model',
        toTopicId: 'business-process-and-grain',
        reason: 'this pair is not a required edge',
      },
    ]
    const result = validateLearningGraph({
      requiredEdgeReasons: [...requiredEdgeReasons, ...invalidFixtures],
    })

    expect(errorCodes(result)).toContain('unknown-reason-topic-reference')
    expect(errorCodes(result)).toContain('reason-for-non-required-edge')
  })

  it('checks related references for self and duplicate entries', () => {
    const graph = cloneGraph()
    const topic = getTopic(graph, 'grain-safe-joins-and-layered-output')
    topic.relatedTopics = [
      'grain-safe-joins-and-layered-output',
      'data-flow-and-layers',
      'data-flow-and-layers',
    ]
    const result = validateLearningGraph({ graph })

    expect(errorCodes(result)).toContain('self-edge')
    expect(errorCodes(result)).toContain('duplicate-related-reference')
  })

  it('validates LearningPath entry/highlight existence and duplicates', () => {
    const path: LearningPath = {
      id: 'test-path',
      entryTopicIds: ['missing-topic'],
      highlightTopicIds: ['warehouse-mental-model', 'warehouse-mental-model'],
    }
    const result = validateLearningGraph({ paths: [path] })

    expect(errorCodes(result)).toContain('unknown-path-topic-reference')
    expect(errorCodes(result)).toContain('duplicate-path-topic-reference')
  })

  it('flags later-to-earlier required edges unless explicitly reviewed', () => {
    const graph = makeInversionGraph()
    const unreviewed = validateLearningGraph({
      graph,
      lessons: inversionLessons,
      requiredEdgeReasons: [inversionReason],
      inversionReviews: [],
    })
    expect(unreviewed.summary.unreviewedInversionCount).toBe(1)
    expect(errorCodes(unreviewed)).toContain('unreviewed-prerequisite-inversion')

    const reviewed = validateLearningGraph({
      graph,
      lessons: inversionLessons,
      requiredEdgeReasons: [inversionReason],
      inversionReviews: [
        {
          fromTopicId: 'late-source',
          toTopicId: 'early-target',
          disposition: 'accepted',
          reason: 'The cross-topic prerequisite is intentional despite course display order.',
        },
      ],
    })
    expect(reviewed.summary.unreviewedInversionCount).toBe(0)
    expect(errorCodes(reviewed)).not.toContain('unreviewed-prerequisite-inversion')
    expect(reviewed.valid).toBe(true)
  })

  it('requires removed inversion edges to stay out of required and recommended relations', () => {
    const graph = cloneGraph()
    getTopic(graph, 'delivery-channels').prerequisites.push('data-service-choice')
    const result = validateLearningGraph({ graph })

    expect(errorCodes(result)).toContain('removed-edge-still-declared')
  })
})
