import { describe, expect, it } from 'vitest'
import { isLessonAvailable, lessons } from '../src/data/course'
import { learningGraph, requiredEdgeReasons } from '../src/features/learning-roadmap/graph'
import {
  learningStageTitles,
  learningTopicTitles,
} from '../src/features/learning-roadmap/presentation'
import { buildRoadmapViewModel } from '../src/features/learning-roadmap/view-model'
import { getRoute } from '../src/utils/routes'

const view = buildRoadmapViewModel(
  learningGraph,
  lessons.filter(isLessonAvailable),
  requiredEdgeReasons,
  (slug) => getRoute(`/learn/${slug}/`),
)

const allTopics = view.stages.flatMap((stage) => stage.topics)
const allLessons = allTopics.flatMap((topic) => topic.lessons)

function getTopic(topicId: string) {
  const topic = allTopics.find(({ id }) => id === topicId)
  if (!topic) throw new Error(`Test fixture Topic not found: ${topicId}`)
  return topic
}

describe('Learning Roadmap view model', () => {
  it('projects every Stage and Topic using the frozen presentation labels', () => {
    expect(view.stages).toHaveLength(8)
    expect(view.stages.map(({ order }) => order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(allTopics).toHaveLength(32)
    expect(new Set(view.stages.map(({ id }) => id))).toEqual(
      new Set(Object.keys(learningStageTitles)),
    )
    expect(new Set(allTopics.map(({ id }) => id))).toEqual(
      new Set(Object.keys(learningTopicTitles)),
    )
    expect(view.stages[0]).toMatchObject({ id: 'foundation', title: '基础认知' })
  })

  it('projects Topic learning semantics and Lesson-derived time into the card contract', () => {
    const lessonMinutes = new Map(
      lessons.filter(isLessonAvailable).map(({ id, estimatedMinutes }) => [id, estimatedMinutes]),
    )

    for (const topic of allTopics) {
      const graphTopic = learningGraph.topics.find(({ id }) => id === topic.id)

      expect(topic.whyLearn.length).toBeGreaterThan(0)
      expect(topic.learningOutcome.length).toBeGreaterThan(0)
      expect(topic.estimatedMinutes).toBe(
        (graphTopic?.lessonIds ?? []).reduce(
          (sum, lessonId) => sum + (lessonMinutes.get(lessonId) ?? 0),
          0,
        ),
      )
    }
  })

  it('joins all canonical Lesson owners to real course titles and getRoute-based URLs once', () => {
    const available = lessons.filter(isLessonAvailable)
    const courseById = new Map(available.map((lesson) => [lesson.id, lesson]))

    expect(allLessons).toHaveLength(54)
    expect(new Set(allLessons.map(({ id }) => id)).size).toBe(54)
    expect(new Set(allLessons.map(({ id }) => id))).toEqual(new Set(available.map(({ id }) => id)))

    for (const lesson of allLessons) {
      const source = courseById.get(lesson.id)
      expect(source).toBeDefined()
      expect(lesson.title).toBe(source?.title)
      expect(lesson.href).toBe(getRoute(`/learn/${source?.slug}/`))
    }
  })

  it('projects every graph relation exactly once and keeps relation strengths distinct', () => {
    const projectedRequired = allTopics
      .flatMap((topic) =>
        topic.requiredPrerequisites.map((relation) => `${relation.id}>${topic.id}`),
      )
      .sort()
    const sourceRequired = learningGraph.topics
      .flatMap((topic) => topic.prerequisites.map((sourceId) => `${sourceId}>${topic.id}`))
      .sort()
    const projectedRecommended = allTopics
      .flatMap((topic) => topic.recommendedPrior.map((relation) => `${relation.id}>${topic.id}`))
      .sort()
    const sourceRecommended = learningGraph.topics
      .flatMap((topic) =>
        (topic.recommendedPrior ?? []).map((sourceId) => `${sourceId}>${topic.id}`),
      )
      .sort()
    const projectedRelated = allTopics
      .flatMap((topic) => topic.relatedTopics.map((relation) => `${topic.id}>${relation.id}`))
      .sort()
    const sourceRelated = learningGraph.topics
      .flatMap((topic) => (topic.relatedTopics ?? []).map((targetId) => `${topic.id}>${targetId}`))
      .sort()

    expect(projectedRequired).toEqual(sourceRequired)
    expect(projectedRecommended).toEqual(sourceRecommended)
    expect(projectedRelated).toEqual(sourceRelated)
    expect(new Set(projectedRequired).size).toBe(projectedRequired.length)
    expect(new Set(projectedRecommended).size).toBe(projectedRecommended.length)
    expect(new Set(projectedRelated).size).toBe(projectedRelated.length)
  })

  it('keeps required, recommended and related references in distinct projections', () => {
    const required = getTopic('quality-rules-and-state')
    expect(required.requiredPrerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sla-and-data-availability',
          title: learningTopicTitles['sla-and-data-availability'],
          reason: expect.stringContaining('SLA'),
        }),
      ]),
    )

    const recommended = getTopic('processing-contract')
    expect(recommended.recommendedPrior).toEqual([
      expect.objectContaining({
        id: 'metric-time-and-derivation',
        href: '#roadmap-topic-metric-time-and-derivation',
      }),
    ])
    expect(recommended.requiredPrerequisites).toEqual([
      expect.objectContaining({ id: 'grain-safe-joins-and-layered-output' }),
    ])

    const related = getTopic('grain-safe-joins-and-layered-output')
    expect(related.relatedTopics).toEqual([
      expect.objectContaining({
        id: 'data-flow-and-layers',
        href: '#roadmap-topic-data-flow-and-layers',
      }),
    ])
    expect(related.requiredPrerequisites.map(({ id }) => id)).not.toContain('data-flow-and-layers')
  })

  it('preserves optional synthesis/case labels without deriving any progress or lock state', () => {
    expect(getTopic('capstone-delivery')).toMatchObject({ kind: 'synthesis', optional: true })
    expect(getTopic('production-lifecycle-debugging')).toMatchObject({
      kind: 'case',
      optional: true,
    })
    expect(allTopics.every((topic) => !('progress' in topic) && !('locked' in topic))).toBe(true)
  })
})
