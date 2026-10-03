import type { LearningStageId } from './types'

/** Presentation labels from the frozen #151 mapping; graph identities remain the source of truth. */
export const learningStageTitles: Record<LearningStageId, string> = {
  foundation: '基础认知',
  modeling: '建模与历史',
  metrics: '指标语义',
  transformation: '数据加工与契约',
  orchestration: '调度与恢复',
  'trust-traceability': '质量与血缘',
  'governance-architecture': '治理与湖仓架构',
  'serving-production': '服务、性能与生产实践',
}

/** Topic display names are UI copy; relationships and lesson ownership stay in learningGraph. */
export const learningTopicTitles: Readonly<Record<string, string>> = {
  'warehouse-mental-model': '仓库问题与术语',
  'data-flow-and-layers': '数据链路与分层',
  'business-process-and-grain': '业务过程与 Grain',
  'star-schema-and-fact-types': '星型模型与事实表形态',
  'historical-dimensions': '历史维度与拉链表',
  'metric-definition-and-scope': '指标定义与统计集合',
  'metric-time-and-derivation': '指标时间语义与派生',
  'transformation-planning-and-cleaning': '加工计划与可信明细',
  'grain-safe-joins-and-layered-output': '安全 Join 与分层产出',
  'processing-contract': '加工契约与重复执行预期',
  'business-date-and-readiness': '业务日期与就绪条件',
  'failure-and-recovery': '失败、Retry、Rerun 与 Backfill',
  'sla-and-data-availability': 'SLA 与数据可用时间',
  'quality-rules-and-state': '质量规则与运行状态',
  'quality-batch-and-evidence': '整批质量与 Quality Event',
  'quality-release-decision': '质量发布与阻断判断',
  'lineage-foundations': '表级与字段级血缘',
  'lineage-investigation-and-impact': '血缘调查与影响分析',
  'lineage-evidence': '血缘关系证据',
  'asset-governance': '资产选择与可用性证据',
  'field-access-and-lifecycle': '字段访问与资产生命周期',
  'change-responsibility': '变更影响与责任闭环',
  'lakehouse-boundaries-and-replication': '湖仓边界与复制取舍',
  'table-layer-and-lakehouse-unity': '表层能力与湖仓一体边界',
  'data-service-contract': '数据服务契约',
  'delivery-channels': '报表、文件与 API 交付',
  'data-service-choice': '数据服务渠道比较与选择',
  'performance-diagnosis-and-scan': '性能诊断与扫描布局',
  'performance-skew-and-incremental-state': '数据倾斜与增量状态',
  'performance-tradeoffs': '性能收益与工程取舍',
  'capstone-delivery': '跨系统交付与 Launch Review',
  'production-lifecycle-debugging': '生产生命周期路径与复盘',
}

export function getLearningTopicTitle(topicId: string): string {
  const title = learningTopicTitles[topicId]
  if (!title) throw new Error(`Missing Roadmap presentation title for Topic "${topicId}"`)
  return title
}
