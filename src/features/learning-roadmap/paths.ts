import type { LearningPath } from './types'

/**
 * Phase 4 Learning Paths frozen by #151 / #186.
 *
 * A Path is an editorial overlay on the single Learning Graph: it never adds
 * edges, never hides Topics, never locks Lessons and never owns progress.
 * `entryTopicIds` mark where to enter the route; `highlightTopicIds` mark what
 * the route focuses on. Required prerequisites stay owned by the Graph and are
 * never auto-added to a highlight list.
 */
export const learningPaths: readonly LearningPath[] = [
  {
    id: 'systematic',
    entryTopicIds: ['warehouse-mental-model'],
    highlightTopicIds: [
      // Stage 1 — 基础认知
      'warehouse-mental-model',
      'data-flow-and-layers',
      // Stage 2 — 建模与历史
      'business-process-and-grain',
      'star-schema-and-fact-types',
      'historical-dimensions',
      // Stage 3 — 指标语义
      'metric-definition-and-scope',
      'metric-time-and-derivation',
      // Stage 4 — 数据加工与契约
      'transformation-planning-and-cleaning',
      'grain-safe-joins-and-layered-output',
      'processing-contract',
      // Stage 5 — 调度与恢复
      'business-date-and-readiness',
      'failure-and-recovery',
      'sla-and-data-availability',
      // Stage 6 — 质量与血缘
      'quality-rules-and-state',
      'quality-batch-and-evidence',
      'quality-release-decision',
      'lineage-foundations',
      'lineage-investigation-and-impact',
      'lineage-evidence',
      // Stage 7 — 治理与湖仓架构
      'asset-governance',
      'field-access-and-lifecycle',
      'change-responsibility',
      'lakehouse-boundaries-and-replication',
      'table-layer-and-lakehouse-unity',
      // Stage 8 — 服务、性能与生产实践
      'data-service-contract',
      'delivery-channels',
      'data-service-choice',
      'performance-diagnosis-and-scan',
      'performance-skew-and-incremental-state',
      'performance-tradeoffs',
    ],
  },
  {
    id: 'sql-etl',
    entryTopicIds: ['business-process-and-grain', 'metric-definition-and-scope'],
    highlightTopicIds: [
      // Stage 2 — 建模与历史
      'business-process-and-grain',
      'star-schema-and-fact-types',
      'historical-dimensions',
      // Stage 3 — 指标语义
      'metric-definition-and-scope',
      'metric-time-and-derivation',
      // Stage 4 — 数据加工与契约
      'transformation-planning-and-cleaning',
      'grain-safe-joins-and-layered-output',
      'processing-contract',
      // Stage 5 — 调度与恢复
      'business-date-and-readiness',
      'failure-and-recovery',
      'sla-and-data-availability',
      // Stage 6 — 质量与血缘
      'quality-rules-and-state',
      'quality-batch-and-evidence',
      'quality-release-decision',
      'lineage-foundations',
      'lineage-investigation-and-impact',
      'lineage-evidence',
      // Stage 7 — 治理与湖仓架构（湖仓按需进入，不入 highlight）
      'asset-governance',
      'field-access-and-lifecycle',
      'change-responsibility',
      // Stage 8 — 服务、性能与生产实践（数据服务按需进入，不入 highlight）
      'performance-diagnosis-and-scan',
      'performance-skew-and-incremental-state',
      'performance-tradeoffs',
    ],
  },
  {
    id: 'production',
    entryTopicIds: [
      'quality-batch-and-evidence',
      'failure-and-recovery',
      'performance-diagnosis-and-scan',
    ],
    highlightTopicIds: [
      // Stage 5 — 调度与恢复
      'business-date-and-readiness',
      'failure-and-recovery',
      'sla-and-data-availability',
      // Stage 6 — 质量与血缘
      'quality-rules-and-state',
      'quality-batch-and-evidence',
      'quality-release-decision',
      'lineage-foundations',
      'lineage-investigation-and-impact',
      'lineage-evidence',
      // Stage 7 — 治理与湖仓架构
      'asset-governance',
      'field-access-and-lifecycle',
      'change-responsibility',
      'lakehouse-boundaries-and-replication',
      'table-layer-and-lakehouse-unity',
      // Stage 8 — 服务、性能与生产实践
      'data-service-contract',
      'delivery-channels',
      'data-service-choice',
      'performance-diagnosis-and-scan',
      'performance-skew-and-incremental-state',
      'performance-tradeoffs',
      'capstone-delivery',
      'production-lifecycle-debugging',
    ],
  },
]

export function getLearningPath(pathId: string): LearningPath | undefined {
  return learningPaths.find((path) => path.id === pathId)
}
