import type {
  CounterpartyTransaction,
  DailyCounterpartyRelation,
  PerformanceDiagnosisData,
  PerformanceScanLayoutData,
  PerformanceSkewData,
  PerformanceStateData,
  PerformanceTeachingCase,
  PerformanceTradeoffData,
  PerformanceVisualization,
} from './types'

export const PERFORMANCE_SIMULATION_NOTE =
  '时间、GB、文件数和 Worker 负载都是 relative simulation / 教学模拟值，只用于比较相对变化，不代表真实引擎性能。'

export const performanceTeachingCase: PerformanceTeachingCase = {
  label: '离线 / T+1 银行反欺诈客户交易对手特征加工',
  description: '每天根据 Transaction（账户交易）生成客户交易对手特征，供次日反欺诈分析使用。',
  factObject: 'Transaction（账户交易）',
  factGrain: 'transaction_id（一行代表一笔交易事件）',
  businessDateField: 'txn_date（交易业务日期，与 business_date 对齐）',
  analysisKey: 'counterparty_id（本章只作分析标识 / 特征键）',
}

const diagnosisData: PerformanceDiagnosisData = {
  symptom: '同一条 T+1 特征任务从几分钟变成几十分钟，业务窗口开始有风险。',
  stages: [
    {
      id: 'scan',
      label: 'Scan',
      durationMinutes: 41,
      description: '从按 txn_date 分区的 Transaction 中读取输入。',
      evidence: [
        { label: 'Scan Bytes', value: '3 年历史', detail: '读取范围远大于最近 30 天特征的需求。' },
        { label: 'Partitions', value: '1,095', detail: '尚未确认日期过滤是否命中分区。' },
      ],
    },
    {
      id: 'join',
      label: 'Join',
      durationMinutes: 6,
      description: '补充客户和账户等已有关联信息。',
      evidence: [
        { label: 'Join Bytes', value: '相对中等', detail: '当前记录不足以证明 Join 是首要瓶颈。' },
        { label: '证据方向', value: '先保留', detail: '继续核对输入规模和关联键分布。' },
      ],
    },
    {
      id: 'shuffle',
      label: 'Shuffle',
      durationMinutes: 15,
      description: '按客户和交易对手重新分发记录。',
      evidence: [
        { label: 'Shuffle Bytes', value: '相对较高', detail: '需要继续检查分布是否有热点 Key。' },
        { label: '分布', value: '待核对', detail: '不能只用平均 Worker 负载下结论。' },
      ],
    },
    {
      id: 'aggregate',
      label: 'Aggregate',
      durationMinutes: 5,
      description: '按客户日和交易对手计算特征结果。',
      evidence: [
        { label: 'Aggregate', value: '5 min', detail: '聚合耗时明显，但不是这次主要耗时。' },
        { label: 'Grain', value: '需要确认', detail: '先确认聚合前的一行代表什么。' },
      ],
    },
    {
      id: 'write',
      label: 'Write',
      durationMinutes: 1,
      description: '写入 T+1 客户日特征和固定窗口结果。',
      evidence: [
        { label: 'Write', value: '1 min', detail: '本次运行中不是主要瓶颈。' },
        { label: '副作用', value: '待检查', detail: '文件布局仍会影响下一次读取。' },
      ],
    },
  ],
  totalRuntimeMinutes: 68,
  longestTask: {
    taskId: 'task-scan-017',
    label: 'Scan Task 017',
    stage: 'scan',
    durationMinutes: 41,
  },
  findings: {
    scan: {
      evidence: [
        'Scan 占 41 min，是 68 min 总运行时间中最长的阶段。',
        '还需要查看 Scan Bytes、命中分区数和文件数。',
      ],
      hypothesis: '日期过滤可能没有发生 Partition Pruning，或命中分区内文件过于碎片化。',
      nextAction: '先用最近 30 天查询对照扫描范围，再分别检查文件布局。',
    },
    join: {
      evidence: ['Join 只占 6 min。', '当前阶段证据不足以支持先改 Join 策略。'],
      hypothesis: 'Join 可能不是当前端到端延迟的首要来源。',
      nextAction: '保留 Join 作为后续检查项，先确认 Scan 和 Shuffle 的证据。',
    },
    shuffle: {
      evidence: ['Shuffle 占 15 min，已经值得检查。', '还需要按 Worker / Task 查看数据分布。'],
      hypothesis: '客户或交易对手相关 Key 可能形成热点，导致长尾。',
      nextAction: '检查 Shuffle Bytes、Key Distribution 和最长 Task，不用平均值代替证据。',
    },
    aggregate: {
      evidence: ['Aggregate 占 5 min。', '聚合前后的 Grain 还需要和业务输出对齐。'],
      hypothesis: '聚合可能重复处理了不必要的历史集合。',
      nextAction: '先写清历史累计、日关系和固定 30 天结果各自的 Grain。',
    },
    write: {
      evidence: ['Write 占 1 min。', '文件布局的影响可能出现在下一次读取，而非本次写入耗时。'],
      hypothesis: '当前不应把写入阶段当作首要优化目标。',
      nextAction: '记录文件数量和后续读取代价，再决定是否安排 Compaction。',
    },
  },
  validation: {
    targetStage: 'scan',
    beforeStageMinutes: 41,
    afterStageMinutes: 12,
    beforeRuntimeMinutes: 68,
    afterRuntimeMinutes: 39,
    change: '验证性地只收窄日期扫描范围，其他阶段先保持不变。',
    sideEffect: '需要继续检查分区内文件数量，以及这个修改对迟到数据和回补范围的影响。',
  },
}

const scanLayoutData: PerformanceScanLayoutData = {
  scanSnapshots: [
    {
      id: 'full-history',
      label: '未发生 Partition Pruning',
      historyLabel: '3 年历史',
      partitionsTouched: 1_095,
      scanBytes: '3.0 PB',
      fileCount: 8_760_000,
      relativeRuntime: '68 min',
      detail: '过滤条件没有在分区层缩小读取范围，先读完整历史再筛选。',
    },
    {
      id: 'partition-pruning',
      label: '启用 Partition Pruning',
      historyLabel: '最近 30 天',
      partitionsTouched: 30,
      scanBytes: '82 TB',
      fileCount: 240_000,
      relativeRuntime: '18 min',
      detail: '查询条件命中 txn_date 分区，只读取最近 30 天分区。',
    },
  ],
  fileLayouts: [
    {
      id: 'fragmented',
      label: '大量碎片小文件',
      fileCount: 240_000,
      averageFileSize: '350 MB',
      readDetail: '分区范围已经缩小，但要打开和调度许多文件。',
      compactionDetail: '当前布局需要额外整理，不能把这次读取直接当作高效读取。',
      relativeRuntime: '18 min',
    },
    {
      id: 'compacted',
      label: '较合理的文件布局',
      fileCount: 3_200,
      averageFileSize: '约 26 GB',
      readDetail: '同样的最近 30 天数据由较少文件承载，打开和调度开销下降。',
      compactionDetail: 'Compaction 会产生额外写入和存储维护工作。',
      relativeRuntime: '12 min',
    },
  ],
  partitionSizes: [
    {
      id: 'ordinary',
      label: '普通日期',
      size: '100~150 GB',
      fileCount: 1_200,
      relativeRuntime: '1×',
      detail: '交易量在正常范围内，按 txn_date 分区仍然容易解释。',
    },
    {
      id: 'double-11',
      label: '双 11',
      size: '1.8 TB',
      fileCount: 14_400,
      relativeRuntime: '约 4×',
      detail: '业务高峰天然集中在一天；大分区需要进一步考虑文件布局、并行度和任务拆分。',
    },
  ],
  targetWindow: '最近 30 天',
  historyWindow: '3 年历史',
}

const shuffleScenario = {
  id: 'shuffle-key' as const,
  label: 'Shuffle Key 倾斜',
  layer: 'calculation-plan' as const,
  title: '按 open_branch_id 分组，线上开户中心成为热点 Key',
  keyLabel: '热点 Key',
  keyValue: 'open_branch_id = 线上开户中心',
  detail: '普通支行约 5 万～20 万账户；线上开户中心可能有数百万账户。',
  workerLoads: [
    { workerId: 'Worker 1', loadGb: 80, detail: '普通支行数据' },
    { workerId: 'Worker 2', loadGb: 75, detail: '普通支行数据' },
    { workerId: 'Worker 3', loadGb: 92, detail: '普通支行数据' },
    { workerId: 'Worker 4', loadGb: 680, detail: '线上开户中心热点' },
  ],
  partitionRows: [
    { label: '普通支行', value: '5 万～20 万账户', detail: 'Key 分布相对分散。' },
    { label: '线上开户中心', value: '数百万账户', detail: '大量记录集中到同一个 open_branch_id。' },
    {
      label: '执行动作',
      value: 'GROUP BY open_branch_id',
      detail: '等价的 Join / Shuffle 也可能出现同类长尾。',
    },
  ],
}

const skewData: PerformanceSkewData = {
  scenarios: [
    {
      id: 'date-partition',
      label: '日期分区倾斜',
      layer: 'storage-execution',
      title: '双 11 分区特别大，问题发生在存储与 Scan',
      keyLabel: '分区字段',
      keyValue: 'txn_date',
      detail: '同一个合理的日期分区字段，也会因为真实业务高峰产生不均匀分区。',
      workerLoads: [],
      partitionRows: [
        { label: '普通日期', value: '100~150 GB', detail: '常规交易量。' },
        { label: '双 11', value: '1.8 TB', detail: '高峰交易集中在一个业务日。' },
        { label: '判断', value: 'txn_date 仍可合理', detail: '单日很大不等于分区字段设计错误。' },
      ],
    },
    shuffleScenario,
  ],
  strategies: [
    { id: 'none', label: '不调整', detail: '保留原始 Key 分布，观察最长 Task。' },
    { id: 'filter-early', label: '提前过滤', detail: '在进入 Shuffle 前减少无关记录。' },
    { id: 'aggregate-early', label: '提前聚合', detail: '先在局部范围合并可合并的记录。' },
    { id: 'split-hot-key', label: '热点 Key 拆分', detail: '把极少数热点拆开处理，再汇总结果。' },
    { id: 'two-phase', label: '两阶段聚合', detail: '先局部聚合，再进行全局聚合。' },
    { id: 'redistribute', label: '调整数据分布', detail: '让工作量不要集中到一个执行分区。' },
  ],
}

const historicalTransactions: readonly CounterpartyTransaction[] = [
  {
    transactionId: 'TX-20260103-001',
    businessDate: '2026-01-03',
    customerId: 'A001',
    counterpartyId: 'B001',
  },
  {
    transactionId: 'TX-20260415-001',
    businessDate: '2026-04-15',
    customerId: 'A001',
    counterpartyId: 'B002',
  },
  {
    transactionId: 'TX-20260822-001',
    businessDate: '2026-08-22',
    customerId: 'A001',
    counterpartyId: 'B001',
  },
  {
    transactionId: 'TX-20260902-001',
    businessDate: '2026-09-02',
    customerId: 'A001',
    counterpartyId: 'B004',
  },
  {
    transactionId: 'TX-20260904-001',
    businessDate: '2026-09-04',
    customerId: 'A002',
    counterpartyId: 'B010',
  },
]

const todayTransactions: readonly CounterpartyTransaction[] = [
  {
    transactionId: 'TX-20260916-001',
    businessDate: '2026-09-16',
    customerId: 'A001',
    counterpartyId: 'B003',
  },
  {
    transactionId: 'TX-20260916-002',
    businessDate: '2026-09-16',
    customerId: 'A001',
    counterpartyId: 'B003',
  },
  {
    transactionId: 'TX-20260916-003',
    businessDate: '2026-09-16',
    customerId: 'A001',
    counterpartyId: 'B001',
  },
  {
    transactionId: 'TX-20260916-004',
    businessDate: '2026-09-16',
    customerId: 'A002',
    counterpartyId: 'B004',
  },
]

const existingFirstSeen = [
  { customerId: 'A001', counterpartyId: 'B001', firstSeenDate: '2026-01-03' },
  { customerId: 'A001', counterpartyId: 'B002', firstSeenDate: '2026-04-15' },
  { customerId: 'A001', counterpartyId: 'B004', firstSeenDate: '2026-09-02' },
  { customerId: 'A002', counterpartyId: 'B010', firstSeenDate: '2026-09-04' },
] as const

const recent30DayRelations: readonly DailyCounterpartyRelation[] = [
  {
    businessDate: '2026-08-22',
    customerId: 'A001',
    counterpartyId: 'B001',
    transactionCount: 1,
  },
  {
    businessDate: '2026-09-02',
    customerId: 'A001',
    counterpartyId: 'B004',
    transactionCount: 1,
  },
  {
    businessDate: '2026-09-16',
    customerId: 'A001',
    counterpartyId: 'B003',
    transactionCount: 2,
  },
  {
    businessDate: '2026-09-16',
    customerId: 'A001',
    counterpartyId: 'B001',
    transactionCount: 1,
  },
  {
    businessDate: '2026-09-04',
    customerId: 'A002',
    counterpartyId: 'B010',
    transactionCount: 1,
  },
  {
    businessDate: '2026-09-16',
    customerId: 'A002',
    counterpartyId: 'B004',
    transactionCount: 1,
  },
]

const stateData: PerformanceStateData = {
  existingFirstSeen,
  historicalTransactions,
  todayTransactions,
  todayBusinessDate: '2026-09-16',
  recent30DayRelations,
  featureRows: [
    {
      customerId: 'A001',
      businessDate: '2026-09-16',
      historicalCounterpartyCount: 4,
      recent30DayCounterpartyCount: 3,
    },
    {
      customerId: 'A002',
      businessDate: '2026-09-16',
      historicalCounterpartyCount: 2,
      recent30DayCounterpartyCount: 2,
    },
  ],
  grainNotes: [
    {
      label: '当日交易对手关系',
      value: 'business_date × customer_id × counterparty_id',
      detail: '某客户在某业务日是否与某交易对手发生过交易。',
    },
    {
      label: 'first_seen 状态',
      value: 'customer_id × counterparty_id',
      detail: '记录历史上首次出现的业务日期。',
    },
    {
      label: '客户日累计特征',
      value: 'customer_id × business_date',
      detail: '截至业务日的历史累计交易对手数。',
    },
    {
      label: '最近 30 天特征',
      value: 'customer_id × business_date',
      detail: '固定最近 30 天内的去重交易对手数。',
    },
  ],
}

const tradeoffData: PerformanceTradeoffData = {
  beforeAfter: [
    {
      id: 'runtime',
      label: '总运行时间',
      before: '68 min',
      after: '18 min',
      detail: '减少了重复历史计算，但不能单独作为成功标准。',
    },
    {
      id: 'scan-compute',
      label: 'Scan / Compute Cost',
      before: '1.00× / 1.00×',
      after: '0.42× / 0.55×',
      detail: '相对资源消耗下降，仍需以实际平台账单和资源观测复核。',
    },
    {
      id: 'freshness',
      label: 'SLA / Freshness',
      before: '07:45 可用',
      after: '06:50 可用',
      detail: '满足 T+1 07:30 的教学目标窗口；迟到修正仍可能触发回补。',
    },
    {
      id: 'storage',
      label: 'Storage',
      before: '1.00×',
      after: '1.28×',
      detail: '保存 first_seen、daily relation 和固定窗口结果，需要额外空间。',
    },
    {
      id: 'backfill-rerun',
      label: 'Backfill / Rerun',
      before: '全量历史重算',
      after: '按业务日期回补并支持幂等重跑',
      detail: '范围更小，但要维护状态修正和历史特征重建路径。',
    },
    {
      id: 'maintenance',
      label: '维护复杂度',
      before: '方案简单，重复扫描昂贵',
      after: '状态与固定窗口需要持续维护',
      detail: '性能收益转化成了写入、回补、重建和排错责任。',
    },
  ],
  acceptanceChecks: [
    { label: '第一步', value: '结果正确', detail: '首见标记、累计数和最近 30 天数都与明细对账。' },
    { label: '第二步', value: '满足 SLA / Freshness', detail: '确认 T+1 结果在约定时间内可用。' },
    {
      label: '第三步',
      value: '资源和成本合理',
      detail: '同时查看 Scan、Compute、Storage 和写入代价。',
    },
    {
      label: '第四步',
      value: '复杂度可维护',
      detail: '确认 Backfill、Rerun、状态重建和责任边界清楚。',
    },
  ],
  lateData: {
    receivedAt: '2026-09-16',
    businessDate: '2026-09-10',
    customerId: 'A001',
    counterpartyId: 'B004',
    currentFirstSeenDate: '2026-09-12',
    correctedFirstSeenDate: '2026-09-10',
    affectedFeatureRange: '2026-09-10 起的客户日特征，直到当前发布日',
    repairActions: [
      '按 business_date = 2026-09-10 写入或覆盖当日关系。',
      '把 A001 + B004 的 first_seen_date 从 2026-09-12 修正为 2026-09-10。',
      '回补受影响客户日累计特征和固定 30 天结果，并保留修正证据。',
      '用同一业务日期重跑时覆盖目标分区，避免追加重复结果。',
    ],
  },
  choices: [
    {
      id: 'worth-it',
      label: '值得优化的情况',
      originalRuntime: '68 min',
      optimizedRuntime: '18 min',
      sla: 'T+1 窗口逐渐无法满足',
      addedCost: '增加可解释的状态、回补和对账维护',
      conclusion: '数据规模和访问压力已经让重复历史扫描成为实际约束，收益足以覆盖新增责任。',
    },
    {
      id: 'not-worth-it',
      label: '不值得优化的情况',
      originalRuntime: '8 min',
      optimizedRuntime: '3 min',
      sla: 'SLA = 4 小时',
      addedCost: '新增大量状态、任务与长期维护逻辑',
      conclusion: '如果现有任务远在 SLA 内完成，额外复杂度可能没有业务价值。',
    },
  ],
  reflectionQuestion:
    '如果以后需要查询任意日期区间内的去重交易对手数，现有累计状态和固定 30 天预计算还能直接满足吗？',
  reflectionHints: [
    'daily distinct 能直接 SUM 吗？',
    'first_seen 能回答任意区间吗？',
    '应保留什么 Grain？',
  ],
}

const baseVisualization = {
  kind: 'performance-lab' as const,
  case: performanceTeachingCase,
  simulationNote: PERFORMANCE_SIMULATION_NOTE,
}

export const performanceVisualizations = {
  diagnosis: {
    ...baseVisualization,
    focus: 'diagnosis' as const,
    diagnosis: diagnosisData,
  },
  scanLayout: {
    ...baseVisualization,
    focus: 'scan-layout' as const,
    scanLayout: scanLayoutData,
  },
  shuffleSkew: {
    ...baseVisualization,
    focus: 'shuffle-skew' as const,
    skew: skewData,
  },
  firstSeen: {
    ...baseVisualization,
    focus: 'first-seen' as const,
    state: stateData,
  },
  tradeoffs: {
    ...baseVisualization,
    focus: 'tradeoffs' as const,
    tradeoffs: tradeoffData,
  },
} satisfies Record<string, PerformanceVisualization>

export function createPerformanceVisualization(
  focus: PerformanceVisualization['focus'],
): PerformanceVisualization {
  switch (focus) {
    case 'diagnosis':
      return performanceVisualizations.diagnosis
    case 'scan-layout':
      return performanceVisualizations.scanLayout
    case 'shuffle-skew':
      return performanceVisualizations.shuffleSkew
    case 'first-seen':
      return performanceVisualizations.firstSeen
    case 'tradeoffs':
      return performanceVisualizations.tradeoffs
  }
}

export { diagnosisData, scanLayoutData, skewData, stateData, tradeoffData }
