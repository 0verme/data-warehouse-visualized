import { describe, expect, it } from 'vitest'
import { learningGraph } from '../src/features/learning-roadmap/graph'
import {
  assertLearningPathPresentationCoverage,
  getLearningPathPresentation,
  learningPathPresentations,
} from '../src/features/learning-roadmap/path-presentation'
import { getLearningPath, learningPaths } from '../src/features/learning-roadmap/paths'
import { validateLearningGraph } from '../src/features/learning-roadmap/validate'

const topicById = new Map(learningGraph.topics.map((topic) => [topic.id, topic] as const))

function pathById(id: string) {
  const path = learningPaths.find((candidate) => candidate.id === id)
  if (!path) throw new Error(`Missing test Path: ${id}`)
  return path
}

describe('Learning Paths (Phase 4)', () => {
  it('declares exactly the three frozen Paths with unique IDs', () => {
    expect(learningPaths.map(({ id }) => id)).toEqual(['systematic', 'sql-etl', 'production'])
    expect(new Set(learningPaths.map(({ id }) => id)).size).toBe(3)
    expect(getLearningPath('sql-etl')?.id).toBe('sql-etl')
    expect(getLearningPath('missing-path')).toBeUndefined()
  })

  it('keeps entry / highlight references explicit, valid and duplicate-free', () => {
    const result = validateLearningGraph({ paths: learningPaths })

    expect(result.summary.pathCount).toBe(3)
    expect(
      result.errors.filter(({ code }) =>
        [
          'unknown-path-topic-reference',
          'duplicate-path-topic-reference',
          'duplicate-path-id',
          'empty-path-entry',
          'empty-path-highlight',
          'entry-not-highlighted',
        ].includes(code),
      ),
    ).toEqual([])

    for (const path of learningPaths) {
      expect(path.entryTopicIds.length).toBeGreaterThan(0)
      expect(path.highlightTopicIds.length).toBeGreaterThan(0)
      expect(new Set(path.entryTopicIds).size).toBe(path.entryTopicIds.length)
      expect(new Set(path.highlightTopicIds).size).toBe(path.highlightTopicIds.length)

      for (const topicId of [...path.entryTopicIds, ...path.highlightTopicIds]) {
        expect(topicById.has(topicId), `${path.id} references unknown Topic "${topicId}"`).toBe(
          true,
        )
      }
      for (const topicId of path.entryTopicIds) {
        expect(
          path.highlightTopicIds,
          `${path.id} entry "${topicId}" must be highlighted`,
        ).toContain(topicId)
      }
    }
  })

  it('does not auto-add required prerequisites to highlights', () => {
    const production = pathById('production')
    // `failure-and-recovery` is a production entry and requires `processing-contract`,
    // but the transformation Topic stays a visible prerequisite, not a highlight.
    expect(topicById.get('failure-and-recovery')?.prerequisites).toContain('processing-contract')
    expect(production.highlightTopicIds).not.toContain('processing-contract')
  })

  it('freezes the systematic path to the 30 concept main-line Topics', () => {
    const path = pathById('systematic')
    const conceptTopicIds = learningGraph.topics
      .filter(({ kind }) => kind !== 'synthesis' && kind !== 'case')
      .map(({ id }) => id)

    expect(path.entryTopicIds).toEqual(['warehouse-mental-model'])
    expect([...path.highlightTopicIds].sort()).toEqual([...conceptTopicIds].sort())
    expect(path.highlightTopicIds).toHaveLength(30)
    expect(path.highlightTopicIds).not.toContain('capstone-delivery')
    expect(path.highlightTopicIds).not.toContain('production-lifecycle-debugging')
  })

  it('freezes the sql-etl path to modeling / metrics / transformation / orchestration / trust / governance / performance', () => {
    const path = pathById('sql-etl')

    expect(path.entryTopicIds).toEqual([
      'business-process-and-grain',
      'metric-definition-and-scope',
    ])
    expect(path.highlightTopicIds).toEqual([
      'business-process-and-grain',
      'star-schema-and-fact-types',
      'historical-dimensions',
      'metric-definition-and-scope',
      'metric-time-and-derivation',
      'transformation-planning-and-cleaning',
      'grain-safe-joins-and-layered-output',
      'processing-contract',
      'business-date-and-readiness',
      'failure-and-recovery',
      'sla-and-data-availability',
      'quality-rules-and-state',
      'quality-batch-and-evidence',
      'quality-release-decision',
      'lineage-foundations',
      'lineage-investigation-and-impact',
      'lineage-evidence',
      'asset-governance',
      'field-access-and-lifecycle',
      'change-responsibility',
      'performance-diagnosis-and-scan',
      'performance-skew-and-incremental-state',
      'performance-tradeoffs',
    ])
    // 湖仓与数据服务第一批按需进入，不进入 highlight。
    for (const topicId of [
      'warehouse-mental-model',
      'data-flow-and-layers',
      'lakehouse-boundaries-and-replication',
      'table-layer-and-lakehouse-unity',
      'data-service-contract',
      'delivery-channels',
      'data-service-choice',
      'capstone-delivery',
      'production-lifecycle-debugging',
    ]) {
      expect(path.highlightTopicIds).not.toContain(topicId)
    }
  })

  it('freezes the production path as a multi-entry problem-domain route', () => {
    const path = pathById('production')

    expect(path.entryTopicIds).toEqual([
      'quality-batch-and-evidence',
      'failure-and-recovery',
      'performance-diagnosis-and-scan',
    ])
    expect(path.highlightTopicIds).toEqual([
      'business-date-and-readiness',
      'failure-and-recovery',
      'sla-and-data-availability',
      'quality-rules-and-state',
      'quality-batch-and-evidence',
      'quality-release-decision',
      'lineage-foundations',
      'lineage-investigation-and-impact',
      'lineage-evidence',
      'asset-governance',
      'field-access-and-lifecycle',
      'change-responsibility',
      'lakehouse-boundaries-and-replication',
      'table-layer-and-lakehouse-unity',
      'data-service-contract',
      'delivery-channels',
      'data-service-choice',
      'performance-diagnosis-and-scan',
      'performance-skew-and-incremental-state',
      'performance-tradeoffs',
      'capstone-delivery',
      'production-lifecycle-debugging',
    ])
    expect(path.highlightTopicIds).toHaveLength(22)
    // 问题域入口 allow multiple, non-linear entries; foundation/modeling stay as context.
    expect(path.highlightTopicIds).not.toContain('warehouse-mental-model')
    expect(path.highlightTopicIds).not.toContain('business-process-and-grain')
    expect(path.highlightTopicIds).not.toContain('metric-definition-and-scope')
  })

  it('keeps presentation copy complete, unique and fail-loud', () => {
    expect(() => assertLearningPathPresentationCoverage()).not.toThrow()
    expect(Object.keys(learningPathPresentations).sort()).toEqual([
      'production',
      'sql-etl',
      'systematic',
    ])

    const titles = new Set<string>()
    for (const path of learningPaths) {
      const presentation = getLearningPathPresentation(path.id)
      expect(presentation.title.trim().length).toBeGreaterThan(0)
      expect(presentation.audience.trim().length).toBeGreaterThan(0)
      expect(presentation.description.trim().length).toBeGreaterThan(0)
      titles.add(presentation.title)
    }
    expect(titles.size).toBe(3)
    expect(() => getLearningPathPresentation('missing-path')).toThrow(/Missing Roadmap Path/)
  })
})
