import { describe, expect, it } from 'vitest'
import { isLessonAvailable, lessonDefinitions } from '../src/data/course'
import {
  learningGraph,
  prerequisiteInversionReviews,
  requiredEdgeReasons,
} from '../src/features/learning-roadmap/graph'
import { validateLearningGraph } from '../src/features/learning-roadmap/validate'

describe('Learning Graph v1 baseline', () => {
  it('matches the frozen Stage, Topic, Lesson, edge and reference counts', () => {
    const result = validateLearningGraph()

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.summary).toMatchObject({
      stageCount: 8,
      topicCount: 32,
      availableLessonCount: 54,
      coveredAvailableLessonCount: 54,
      requiredEdgeCount: 48,
      recommendedEdgeCount: 17,
      relatedReferenceCount: 1,
      requiredReasonFixtureCount: 48,
      duplicateOwnerCount: 0,
      unknownLessonCount: 0,
      unknownReferenceCount: 0,
      emptyTopicCount: 0,
      selfEdgeCount: 0,
      duplicateEdgeCount: 0,
      cycleCount: 0,
      requiredRootCount: 4,
      orphanTopicCount: 0,
      unreviewedInversionCount: 0,
    })
    expect(lessonDefinitions.filter(isLessonAvailable)).toHaveLength(54)
    expect(requiredEdgeReasons).toHaveLength(48)
    expect(prerequisiteInversionReviews).toEqual([
      expect.objectContaining({
        fromTopicId: 'data-service-choice',
        toTopicId: 'delivery-channels',
        disposition: 'removed',
      }),
    ])
  })

  it('keeps the three Data Service Topics separate and the channel-to-choice required edge', () => {
    const topicIds = learningGraph.topics.map(({ id }) => id)
    const choice = learningGraph.topics.find(({ id }) => id === 'data-service-choice')

    expect(topicIds).toEqual(
      expect.arrayContaining(['data-service-contract', 'delivery-channels', 'data-service-choice']),
    )
    expect(choice?.prerequisites).toContain('delivery-channels')
    expect(topicIds).not.toContain('data-service-contract-and-choice')
  })

  it('marks the capstone and production case by knowledge kind', () => {
    expect(learningGraph.topics.find(({ id }) => id === 'capstone-delivery')).toMatchObject({
      kind: 'synthesis',
      optional: true,
    })
    expect(
      learningGraph.topics.find(({ id }) => id === 'production-lifecycle-debugging'),
    ).toMatchObject({ kind: 'case', optional: true })
  })
})
