import { describe, expect, it } from 'vitest'
import { isLessonAvailable, lessons } from '../src/data/course'
import { learningGraph, requiredEdgeReasons } from '../src/features/learning-roadmap/graph'
import {
  getLearningTopicDetail,
  learningTopicDetails,
} from '../src/features/learning-roadmap/topic-details'
import { buildRoadmapViewModel } from '../src/features/learning-roadmap/view-model'
import { getRoute } from '../src/utils/routes'

const availableLessons = lessons.filter(isLessonAvailable)
const lessonById = new Map(availableLessons.map((lesson) => [lesson.id, lesson]))
const view = buildRoadmapViewModel(learningGraph, availableLessons, requiredEdgeReasons, (slug) =>
  getRoute(`/learn/${slug}/`),
)
const allTopics = view.stages.flatMap((stage) => stage.topics)

function getTopic(topicId: string) {
  const topic = allTopics.find(({ id }) => id === topicId)
  if (!topic) throw new Error(`Test fixture Topic not found: ${topicId}`)
  return topic
}

describe('Learning Roadmap Topic Detail', () => {
  it('covers every graph Topic exactly once (32/32)', () => {
    expect(learningTopicDetails).toHaveLength(32)
    expect(new Set(learningTopicDetails.map(({ topicId }) => topicId)).size).toBe(32)
    expect(learningTopicDetails.map(({ topicId }) => topicId).sort()).toEqual(
      learningGraph.topics.map(({ id }) => id).sort(),
    )
  })

  it('projects non-empty whyLearn and learningOutcome for every Topic', () => {
    for (const topic of allTopics) {
      expect(topic.whyLearn.trim().length).toBeGreaterThan(0)
      expect(topic.learningOutcome.trim().length).toBeGreaterThan(0)
    }
  })

  it('fails fast for an unknown Topic', () => {
    expect(() => getLearningTopicDetail('not-a-real-topic')).toThrow(
      /Missing Roadmap Topic detail for Topic "not-a-real-topic"/,
    )
  })

  it('derives estimatedMinutes from mapped Lesson metadata for every Topic', () => {
    let topicTotal = 0

    for (const topic of allTopics) {
      const graphTopic = learningGraph.topics.find(({ id }) => id === topic.id)
      expect(graphTopic).toBeDefined()

      const expected = (graphTopic?.lessonIds ?? []).reduce((sum, lessonId) => {
        const lesson = lessonById.get(lessonId)
        if (!lesson) throw new Error(`Missing test Lesson fixture: ${lessonId}`)
        return sum + lesson.estimatedMinutes
      }, 0)

      expect(topic.estimatedMinutes).toBe(expected)
      topicTotal += topic.estimatedMinutes
    }

    // Every available Lesson is owned by exactly one Topic, so both totals must agree.
    const courseTotal = availableLessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0)
    expect(topicTotal).toBe(courseTotal)
  })

  it('sums multi-lesson Topics and keeps single-lesson Topics exact', () => {
    expect(getTopic('delivery-channels')).toMatchObject({
      estimatedMinutes: 34,
      lessons: expect.arrayContaining([
        expect.objectContaining({ id: 'lesson-data-service-report' }),
        expect.objectContaining({ id: 'lesson-data-service-file' }),
        expect.objectContaining({ id: 'lesson-data-service-api' }),
      ]),
    })
    expect(getTopic('quality-rules-and-state').estimatedMinutes).toBe(20)
    expect(getTopic('processing-contract')).toMatchObject({
      estimatedMinutes: 10,
      lessons: [expect.objectContaining({ id: 'lesson-05-contract' })],
    })
    expect(getTopic('capstone-delivery').estimatedMinutes).toBe(35)
  })

  it('does not duplicate course metadata or progress semantics in the detail SSOT', () => {
    const lessonTitles = availableLessons.map(({ title }) => title)
    const lessonSummaries = availableLessons.map(({ summary }) => summary)

    for (const detail of learningTopicDetails) {
      expect(Object.keys(detail).sort()).toEqual(['learningOutcome', 'topicId', 'whyLearn'])
      for (const copy of [detail.whyLearn, detail.learningOutcome]) {
        expect(lessonTitles.some((title) => copy.includes(title))).toBe(false)
        expect(lessonSummaries.some((summary) => copy.includes(summary))).toBe(false)
      }
    }
  })

  it('keeps copy free of generic filler and teacher-voice openings', () => {
    const bannedFiller = ['非常重要', '至关重要', '深入理解', '全面掌握', '助你提升', '本节将介绍']
    const bannedOutcomeOpeners = ['了解', '学习', '掌握']

    for (const detail of learningTopicDetails) {
      for (const banned of bannedFiller) {
        expect(detail.whyLearn).not.toContain(banned)
        expect(detail.learningOutcome).not.toContain(banned)
      }
      expect(bannedOutcomeOpeners.some((opener) => detail.learningOutcome.startsWith(opener))).toBe(
        false,
      )
      expect(/^(判断|区分|解释|识别|选择|追踪|验证|综合|从)/.test(detail.learningOutcome)).toBe(
        true,
      )
    }
  })

  it('writes synthesis and case Topics with their own outcome shape', () => {
    expect(getTopic('capstone-delivery').learningOutcome).toMatch(/^综合/)
    expect(getTopic('production-lifecycle-debugging').learningOutcome).toMatch(/^从/)
  })
})
