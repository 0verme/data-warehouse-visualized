import type { LearningGraph, PrerequisiteInversionReview, RequiredEdgeReason } from './types'

export const learningGraph: LearningGraph = {
  version: 1,
  stages: [
    { id: 'foundation', order: 1 },
    { id: 'modeling', order: 2 },
    { id: 'metrics', order: 3 },
    { id: 'transformation', order: 4 },
    { id: 'orchestration', order: 5 },
    { id: 'trust-traceability', order: 6 },
    { id: 'governance-architecture', order: 7 },
    { id: 'serving-production', order: 8 },
  ],
  topics: [
    {
      id: 'warehouse-mental-model',
      stageId: 'foundation',
      lessonIds: ['lesson-01', 'lesson-01-terms'],
      prerequisites: [],
    },
    {
      id: 'data-flow-and-layers',
      stageId: 'foundation',
      lessonIds: ['lesson-01-report-journey', 'lesson-02'],
      prerequisites: ['warehouse-mental-model'],
    },
    {
      id: 'business-process-and-grain',
      stageId: 'modeling',
      lessonIds: ['lesson-03', 'lesson-grain'],
      prerequisites: [],
      recommendedPrior: ['warehouse-mental-model'],
    },
    {
      id: 'star-schema-and-fact-types',
      stageId: 'modeling',
      lessonIds: ['lesson-star-schema-grain', 'lesson-fact-table-types'],
      prerequisites: ['business-process-and-grain'],
    },
    {
      id: 'historical-dimensions',
      stageId: 'modeling',
      lessonIds: ['lesson-scd-type-2'],
      prerequisites: ['star-schema-and-fact-types'],
    },
    {
      id: 'metric-definition-and-scope',
      stageId: 'metrics',
      lessonIds: ['lesson-04', 'lesson-metric-definition'],
      prerequisites: ['business-process-and-grain'],
    },
    {
      id: 'metric-time-and-derivation',
      stageId: 'metrics',
      lessonIds: ['lesson-metric-time', 'lesson-metric-derivations'],
      prerequisites: ['metric-definition-and-scope', 'star-schema-and-fact-types'],
    },
    {
      id: 'transformation-planning-and-cleaning',
      stageId: 'transformation',
      lessonIds: ['lesson-05', 'lesson-05-cleaning'],
      prerequisites: ['metric-definition-and-scope'],
      recommendedPrior: ['data-flow-and-layers'],
    },
    {
      id: 'grain-safe-joins-and-layered-output',
      stageId: 'transformation',
      lessonIds: ['lesson-05-join', 'lesson-05-layers'],
      prerequisites: ['business-process-and-grain', 'transformation-planning-and-cleaning'],
      relatedTopics: ['data-flow-and-layers'],
    },
    {
      id: 'processing-contract',
      stageId: 'transformation',
      lessonIds: ['lesson-05-contract'],
      prerequisites: ['grain-safe-joins-and-layered-output'],
      recommendedPrior: ['metric-time-and-derivation'],
    },
    {
      id: 'business-date-and-readiness',
      stageId: 'orchestration',
      lessonIds: ['lesson-06', 'lesson-scheduling-readiness'],
      prerequisites: ['processing-contract'],
      recommendedPrior: ['metric-time-and-derivation'],
    },
    {
      id: 'failure-and-recovery',
      stageId: 'orchestration',
      lessonIds: ['lesson-scheduling-failure', 'lesson-scheduling-rerun'],
      prerequisites: ['business-date-and-readiness', 'processing-contract'],
    },
    {
      id: 'sla-and-data-availability',
      stageId: 'orchestration',
      lessonIds: ['lesson-scheduling-sla'],
      prerequisites: ['business-date-and-readiness'],
      recommendedPrior: ['failure-and-recovery'],
    },
    {
      id: 'quality-rules-and-state',
      stageId: 'trust-traceability',
      lessonIds: ['lesson-07', 'lesson-07-rules'],
      prerequisites: [
        'business-process-and-grain',
        'processing-contract',
        'business-date-and-readiness',
        'sla-and-data-availability',
      ],
    },
    {
      id: 'quality-batch-and-evidence',
      stageId: 'trust-traceability',
      lessonIds: ['lesson-07-dataset', 'lesson-07-evidence'],
      prerequisites: [
        'quality-rules-and-state',
        'sla-and-data-availability',
        'grain-safe-joins-and-layered-output',
        'metric-definition-and-scope',
      ],
    },
    {
      id: 'quality-release-decision',
      stageId: 'trust-traceability',
      lessonIds: ['lesson-07-release'],
      prerequisites: ['quality-batch-and-evidence'],
      recommendedPrior: ['sla-and-data-availability'],
    },
    {
      id: 'lineage-foundations',
      stageId: 'trust-traceability',
      lessonIds: ['lesson-08', 'lesson-08-fields'],
      prerequisites: ['grain-safe-joins-and-layered-output', 'data-flow-and-layers'],
    },
    {
      id: 'lineage-investigation-and-impact',
      stageId: 'trust-traceability',
      lessonIds: ['lesson-08-investigation', 'lesson-08-impact'],
      prerequisites: ['lineage-foundations', 'quality-batch-and-evidence'],
    },
    {
      id: 'lineage-evidence',
      stageId: 'trust-traceability',
      lessonIds: ['lesson-08-evidence'],
      prerequisites: ['lineage-foundations'],
      recommendedPrior: ['lineage-investigation-and-impact'],
    },
    {
      id: 'asset-governance',
      stageId: 'governance-architecture',
      lessonIds: ['lesson-09-1', 'lesson-09-2'],
      prerequisites: ['quality-release-decision', 'metric-definition-and-scope'],
    },
    {
      id: 'field-access-and-lifecycle',
      stageId: 'governance-architecture',
      lessonIds: ['lesson-09-3', 'lesson-09-4'],
      prerequisites: ['asset-governance'],
    },
    {
      id: 'change-responsibility',
      stageId: 'governance-architecture',
      lessonIds: ['lesson-09-5'],
      prerequisites: ['lineage-investigation-and-impact'],
      recommendedPrior: ['field-access-and-lifecycle'],
    },
    {
      id: 'lakehouse-boundaries-and-replication',
      stageId: 'governance-architecture',
      lessonIds: ['lesson-10', 'lesson-10-replication'],
      prerequisites: [],
      recommendedPrior: ['data-flow-and-layers', 'processing-contract'],
    },
    {
      id: 'table-layer-and-lakehouse-unity',
      stageId: 'governance-architecture',
      lessonIds: ['lesson-10-table-layer', 'lesson-10-unity'],
      prerequisites: ['lakehouse-boundaries-and-replication'],
      recommendedPrior: ['processing-contract'],
    },
    {
      id: 'data-service-contract',
      stageId: 'serving-production',
      lessonIds: ['lesson-data-service'],
      prerequisites: ['quality-release-decision'],
      recommendedPrior: ['asset-governance'],
    },
    {
      id: 'delivery-channels',
      stageId: 'serving-production',
      lessonIds: [
        'lesson-data-service-report',
        'lesson-data-service-file',
        'lesson-data-service-api',
      ],
      prerequisites: [],
    },
    {
      id: 'data-service-choice',
      stageId: 'serving-production',
      lessonIds: ['lesson-data-service-choice'],
      prerequisites: ['delivery-channels'],
    },
    {
      id: 'performance-diagnosis-and-scan',
      stageId: 'serving-production',
      lessonIds: ['lesson-11', 'lesson-11-scan-layout'],
      prerequisites: ['grain-safe-joins-and-layered-output'],
      recommendedPrior: [
        'sla-and-data-availability',
        'lakehouse-boundaries-and-replication',
        'table-layer-and-lakehouse-unity',
      ],
    },
    {
      id: 'performance-skew-and-incremental-state',
      stageId: 'serving-production',
      lessonIds: ['lesson-11-shuffle-skew', 'lesson-11-first-seen'],
      prerequisites: ['performance-diagnosis-and-scan', 'business-process-and-grain'],
    },
    {
      id: 'performance-tradeoffs',
      stageId: 'serving-production',
      lessonIds: ['lesson-11-tradeoffs'],
      prerequisites: ['performance-skew-and-incremental-state', 'sla-and-data-availability'],
      recommendedPrior: ['quality-release-decision'],
    },
    {
      id: 'capstone-delivery',
      stageId: 'serving-production',
      lessonIds: ['lesson-12'],
      prerequisites: [
        'processing-contract',
        'quality-release-decision',
        'lineage-investigation-and-impact',
        'data-service-choice',
        'performance-tradeoffs',
      ],
      recommendedPrior: ['change-responsibility'],
      kind: 'synthesis',
      optional: true,
    },
    {
      id: 'production-lifecycle-debugging',
      stageId: 'serving-production',
      lessonIds: ['lesson-13-1'],
      prerequisites: [
        'star-schema-and-fact-types',
        'business-date-and-readiness',
        'failure-and-recovery',
      ],
      kind: 'case',
      optional: true,
    },
  ],
}

/** Each required prerequisite pair has exactly one knowledge-prerequisite reason. */
export const requiredEdgeReasons: RequiredEdgeReason[] = [
  {
    fromTopicId: 'warehouse-mental-model',
    toTopicId: 'data-flow-and-layers',
    reason: '讨论公共加工如何支撑多个消费者，需要先理解数据仓库解决的跨系统分析问题。',
  },
  {
    fromTopicId: 'business-process-and-grain',
    toTopicId: 'star-schema-and-fact-types',
    reason: '判断事实表记录什么以及一行代表什么，必须先明确业务过程与 Grain。',
  },
  {
    fromTopicId: 'star-schema-and-fact-types',
    toTopicId: 'historical-dimensions',
    reason: '理解历史维度如何关联事实记录，需要先掌握事实、维度及其键关系。',
  },
  {
    fromTopicId: 'business-process-and-grain',
    toTopicId: 'metric-definition-and-scope',
    reason: '定义指标统计对象和度量时，必须先知道业务过程及其记录粒度。',
  },
  {
    fromTopicId: 'metric-definition-and-scope',
    toTopicId: 'metric-time-and-derivation',
    reason: '区分时点与期间并组合派生指标，需要先明确指标的对象、度量和范围。',
  },
  {
    fromTopicId: 'star-schema-and-fact-types',
    toTopicId: 'metric-time-and-derivation',
    reason: '判断指标时间表达对应状态还是事件，必须先理解事实表的时间形态。',
  },
  {
    fromTopicId: 'metric-definition-and-scope',
    toTopicId: 'transformation-planning-and-cleaning',
    reason: '把业务口径转成加工输入与可信明细规则，需要先明确指标对象和统计范围。',
  },
  {
    fromTopicId: 'business-process-and-grain',
    toTopicId: 'grain-safe-joins-and-layered-output',
    reason: '分析 Join 是否复制或改变结果行，必须先能说明业务过程与输入 Grain。',
  },
  {
    fromTopicId: 'transformation-planning-and-cleaning',
    toTopicId: 'grain-safe-joins-and-layered-output',
    reason: '解释加工后的明细与汇总如何分层产出，需要先理解加工计划和可信输入。',
  },
  {
    fromTopicId: 'grain-safe-joins-and-layered-output',
    toTopicId: 'processing-contract',
    reason: '约定加工交接的输入、输出和重复执行预期，需要先明确加工结果及其粒度。',
  },
  {
    fromTopicId: 'processing-contract',
    toTopicId: 'business-date-and-readiness',
    reason: '判断任务何时可运行以及写入哪个业务分区，需要先理解加工交接契约。',
  },
  {
    fromTopicId: 'business-date-and-readiness',
    toTopicId: 'failure-and-recovery',
    reason: '讨论失败后哪些任务等待以及如何重跑，需要先理解业务日期与运行就绪条件。',
  },
  {
    fromTopicId: 'processing-contract',
    toTopicId: 'failure-and-recovery',
    reason: '判断 Retry、Rerun 是否会造成重复写入，需要先理解输入输出和幂等预期。',
  },
  {
    fromTopicId: 'business-date-and-readiness',
    toTopicId: 'sla-and-data-availability',
    reason: '判断数据是否在业务可用时间前就绪，需要先区分业务日期与任务启动条件。',
  },
  {
    fromTopicId: 'business-process-and-grain',
    toTopicId: 'quality-rules-and-state',
    reason: '制定记录身份和业务字段质量规则，需要先知道被检查数据代表什么业务过程。',
  },
  {
    fromTopicId: 'processing-contract',
    toTopicId: 'quality-rules-and-state',
    reason: '区分加工完成与数据可信状态，需要先理解交接输入、输出和运行承诺。',
  },
  {
    fromTopicId: 'business-date-and-readiness',
    toTopicId: 'quality-rules-and-state',
    reason: '解释质量判断所对应的数据批次和业务日期，需要先掌握日期与就绪语义。',
  },
  {
    fromTopicId: 'sla-and-data-availability',
    toTopicId: 'quality-rules-and-state',
    reason:
      '该质量状态课程从 Scheduler SUCCESS / SLA MET 交接出发，理解它需要 SLA 与可用时间语义。',
  },
  {
    fromTopicId: 'quality-rules-and-state',
    toTopicId: 'quality-batch-and-evidence',
    reason: '把单条规则扩展为整批判断和 Quality Event，需要先理解规则与运行状态。',
  },
  {
    fromTopicId: 'sla-and-data-availability',
    toTopicId: 'quality-batch-and-evidence',
    reason: '判断整批数据是否完整且及时，需要先理解业务要求的可用时间。',
  },
  {
    fromTopicId: 'grain-safe-joins-and-layered-output',
    toTopicId: 'quality-batch-and-evidence',
    reason: '跨层对账要判断金额差异是否来自粒度或 Join，必须先理解安全 Join 和分层产出。',
  },
  {
    fromTopicId: 'metric-definition-and-scope',
    toTopicId: 'quality-batch-and-evidence',
    reason: '整批跨层对账必须固定业务日期、币种、统计集合和客户 / 产品口径。',
  },
  {
    fromTopicId: 'quality-batch-and-evidence',
    toTopicId: 'quality-release-decision',
    reason: '决定发布、阻断或隔离时，需要先具备整批质量结论及其可调查证据。',
  },
  {
    fromTopicId: 'grain-safe-joins-and-layered-output',
    toTopicId: 'lineage-foundations',
    reason: '追踪表与字段在加工链中的来源，需要先理解 Join 和分层怎样改变数据。',
  },
  {
    fromTopicId: 'data-flow-and-layers',
    toTopicId: 'lineage-foundations',
    reason: '理解上游来源、加工位置和消费去向，需要先掌握数据链路与层级职责。',
  },
  {
    fromTopicId: 'lineage-foundations',
    toTopicId: 'lineage-investigation-and-impact',
    reason: '按依赖关系定位根因或传播影响，必须先理解表级与字段级血缘关系。',
  },
  {
    fromTopicId: 'quality-batch-and-evidence',
    toTopicId: 'lineage-investigation-and-impact',
    reason: '从质量事件选择上游调查起点，需要先理解整批质量结论及其证据。',
  },
  {
    fromTopicId: 'lineage-foundations',
    toTopicId: 'lineage-evidence',
    reason: '判断图中关系是否可信，必须先知道血缘边所表达的来源与转换关系。',
  },
  {
    fromTopicId: 'quality-release-decision',
    toTopicId: 'asset-governance',
    reason: '比较候选资产今天是否可用，需要先区分质量结论与发布决定。',
  },
  {
    fromTopicId: 'metric-definition-and-scope',
    toTopicId: 'asset-governance',
    reason: '依据业务定义与范围从候选资产中选择适用对象，需要先理解指标口径。',
  },
  {
    fromTopicId: 'asset-governance',
    toTopicId: 'field-access-and-lifecycle',
    reason: '判断已选资产中的字段能否使用以及旧资产何时退役，需要先识别资产及其用途。',
  },
  {
    fromTopicId: 'lineage-investigation-and-impact',
    toTopicId: 'change-responsibility',
    reason: '把字段变化传播到受影响资产与 Owner，需要先能分析血缘影响范围。',
  },
  {
    fromTopicId: 'lakehouse-boundaries-and-replication',
    toTopicId: 'table-layer-and-lakehouse-unity',
    reason: '讨论表层事务能力和湖仓一体的边界，需要先理解存储体系及复制取舍。',
  },
  {
    fromTopicId: 'quality-release-decision',
    toTopicId: 'data-service-contract',
    reason: '定义可交付数据服务的发布边界，需要先理解质量结论如何决定能否发布。',
  },
  {
    fromTopicId: 'delivery-channels',
    toTopicId: 'data-service-choice',
    reason: '比较渠道并做选择，需要先理解 report、file、API 的消费边界。',
  },
  {
    fromTopicId: 'grain-safe-joins-and-layered-output',
    toTopicId: 'performance-diagnosis-and-scan',
    reason: '诊断扫描与加工性能时，需要先理解数据粒度和 Join / 分层可能造成的工作量。',
  },
  {
    fromTopicId: 'performance-diagnosis-and-scan',
    toTopicId: 'performance-skew-and-incremental-state',
    reason: '识别长尾倾斜和增量状态优化问题，需要先掌握基础性能诊断与扫描观察。',
  },
  {
    fromTopicId: 'business-process-and-grain',
    toTopicId: 'performance-skew-and-incremental-state',
    reason: '判断倾斜键或增量状态是否符合业务记录粒度，需要先理解业务过程与 Grain。',
  },
  {
    fromTopicId: 'performance-skew-and-incremental-state',
    toTopicId: 'performance-tradeoffs',
    reason: '评估优化后是否值得承担成本与复杂度，需要先理解具体性能问题和增量状态。',
  },
  {
    fromTopicId: 'sla-and-data-availability',
    toTopicId: 'performance-tradeoffs',
    reason: '比较提速收益是否满足交付目标，需要先理解数据可用时间与 SLA。',
  },
  {
    fromTopicId: 'processing-contract',
    toTopicId: 'capstone-delivery',
    reason: '完成跨系统交付评审，需要先能说明加工输入、输出与重复执行承诺。',
  },
  {
    fromTopicId: 'quality-release-decision',
    toTopicId: 'capstone-delivery',
    reason: '做 Launch Review 的发布判断，需要先掌握质量证据如何形成发布或阻断决定。',
  },
  {
    fromTopicId: 'lineage-investigation-and-impact',
    toTopicId: 'capstone-delivery',
    reason: '在综合交付中解释变更影响与调查范围，需要先理解血缘调查和影响分析。',
  },
  {
    fromTopicId: 'data-service-choice',
    toTopicId: 'capstone-delivery',
    reason: '完成数据产品交付方案，需要先能依据消费者选择合适的数据服务渠道。',
  },
  {
    fromTopicId: 'performance-tradeoffs',
    toTopicId: 'capstone-delivery',
    reason: '综合评审交付性能、成本与维护风险，需要先理解工程优化取舍。',
  },
  {
    fromTopicId: 'star-schema-and-fact-types',
    toTopicId: 'production-lifecycle-debugging',
    reason: '分析生命周期故障中的目标对象和历史记录，需要先理解事实记录与时间形态。',
  },
  {
    fromTopicId: 'business-date-and-readiness',
    toTopicId: 'production-lifecycle-debugging',
    reason: '定位次日路径为何缺少当前日期写入单元，需要先区分业务日期与对象存在状态。',
  },
  {
    fromTopicId: 'failure-and-recovery',
    toTopicId: 'production-lifecycle-debugging',
    reason: '复盘生产任务的失败路径与恢复动作，需要先理解失败传播、Retry 和 Rerun。',
  },
]

/**
 * Historical review of the rejected reverse Data Service edge. It is intentionally
 * absent from the graph; the accepted current edge is delivery-channels → data-service-choice.
 */
export const prerequisiteInversionReviews: PrerequisiteInversionReview[] = [
  {
    fromTopicId: 'data-service-choice',
    toTopicId: 'delivery-channels',
    disposition: 'removed',
    reason:
      '课程先教 report、file、API 的消费边界，再教渠道选择；原反向前置把第 10 章较晚的 choice 错置为较早 channels 的前提，故删除。',
  },
]
