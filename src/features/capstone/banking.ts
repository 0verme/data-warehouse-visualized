import { governanceVisualizations } from '../../content/lessons/data-governance'
import { depositBalanceDataset, depositBranches } from '../../data/deposit-balance'
import {
  qualityEvaluationToGovernanceEvidence,
  qualityEventToGovernanceEvidence,
} from '../governance/quality-adapter'
import { performanceVisualizations } from '../performance/banking'
import {
  BANKING_SCHEDULER_TASK_IDS,
  bankingDepositBalanceTaskContract,
  createBankingSchedulerTasks,
} from '../scheduler/banking'
import type { SchedulerRunState, SchedulerTaskDefinition } from '../scheduler/types'
import {
  buildSchedulerTimeline,
  createInitialSchedulerRun,
  createPartitionRerunPlan,
} from '../../utils/scheduler'
import {
  createDataQualityVisualization,
  createQualitySchedulerRun,
  createQualityTeachingModel,
  evaluateDataQuality,
} from '../../utils/data-quality'
import { buildBranchBusinessDaily } from '../../utils/capstone'
import {
  BANKING_LINEAGE_NODE_IDS,
  bankingLineageEdges,
  bankingLineageNodes,
} from '../lineage/banking'
import { qualityEventToLineageInvestigation } from '../lineage/quality-adapter'
import type {
  LineageEdge,
  LineageEvidence,
  LineageEvidenceSource,
  LineageNode,
  GovernanceAsset,
  GovernanceField,
} from '../../types'
import { analyzeLineageInvestigation } from '../../utils/lineage'
import type {
  CapstoneDataServiceProjection,
  CapstoneGovernanceProjection,
  CapstoneLineageProjection,
  CapstoneMissionBrief,
  CapstoneQualityProjection,
  CapstoneSchedulerProjection,
  CapstoneSourceFacts,
  CapstoneVisualization,
  LoanBalanceSnapshot,
} from './types'
import type {
  DataServiceApiExample,
  DataServiceFileDelivery,
  DataServicePublishedAsset,
  DataServicePublishedBalance,
} from '../data-service/types'
import type { QualityBankingModel, QualityRuleDefinition } from '../data-quality/types'
import type { TransformationTaskContract } from '../sql-transformation/types'

export const CAPSTONE_BUSINESS_DATE = '2026-09-30'
export const CAPSTONE_PROCESSING_STARTED_AT = '2026-10-01 07:00'
export const CAPSTONE_LOAN_EXPECTED_AT = '2026-10-01 06:30'
export const CAPSTONE_LOAN_ARRIVED_AT = '2026-10-01 07:35'
export const CAPSTONE_DELIVERY_SLA_AT = '2026-10-01 08:00'
export const CAPSTONE_FINAL_PRODUCT_TABLE = 'branch_business_daily'
export const CAPSTONE_FINAL_GRAIN = 'business_date × branch_id'

/** The extra branch exists only to make the denominator-zero behavior observable. */
export const capstoneBranches = [
  ...depositBranches,
  { branchId: 'B03', branchName: '零存款教学分行' },
] as const

export const capstoneLoanBalanceSnapshots: readonly LoanBalanceSnapshot[] = [
  {
    loan_id: 'L001',
    customer_id: 'C001',
    branch_id: 'B01',
    snapshot_date: CAPSTONE_BUSINESS_DATE,
    balance: 150_000,
  },
  {
    loan_id: 'L002',
    customer_id: 'C002',
    branch_id: 'B01',
    snapshot_date: CAPSTONE_BUSINESS_DATE,
    balance: 60_000,
  },
  {
    loan_id: 'L003',
    customer_id: 'C003',
    branch_id: 'B02',
    snapshot_date: CAPSTONE_BUSINESS_DATE,
    balance: 30_000,
  },
  {
    loan_id: 'L004',
    customer_id: 'C004',
    branch_id: 'B03',
    snapshot_date: CAPSTONE_BUSINESS_DATE,
    balance: 12_000,
  },
]

export const CAPSTONE_LINEAGE_NODE_IDS = {
  accountBalanceSnapshot: BANKING_LINEAGE_NODE_IDS.accountBalanceSnapshot,
  branch: BANKING_LINEAGE_NODE_IDS.branch,
  depositTopic: BANKING_LINEAGE_NODE_IDS.dws,
  loanBalanceSnapshot: 'capstone-loan-balance-snapshot',
  loanTopic: 'capstone-dws-loan-balance',
  product: 'capstone-branch-business-daily',
  depositBalance: 'capstone-field-deposit-balance',
  loanBalance: 'capstone-field-loan-balance',
  ratio: 'capstone-metric-loan-deposit-ratio',
  report: 'capstone-consumer-report',
  file: 'capstone-consumer-file',
  api: 'capstone-consumer-api',
} as const

const capstoneMission: CapstoneMissionBrief = {
  id: 'branch-business-daily-mission',
  title: '跨核心系统与信贷系统，在 08:00 前交付分行经营分析数据产品',
  businessDate: CAPSTONE_BUSINESS_DATE,
  deliverySlaAt: CAPSTONE_DELIVERY_SLA_AT,
  consumers: ['经营报表 / BI', '文件接口', 'API'],
  metrics: [
    {
      id: 'deposit-balance',
      label: '存款余额',
      formula: 'SUM(AccountBalanceSnapshot.balance)',
      unit: '元',
      timeSemantics: '指定 business_date 的日终余额状态。',
    },
    {
      id: 'loan-balance',
      label: '贷款余额',
      formula: 'SUM(LoanBalanceSnapshot.balance)',
      unit: '元',
      timeSemantics: '指定 business_date 的日终余额状态。',
    },
    {
      id: 'loan-deposit-ratio',
      label: '存贷比',
      formula: 'loan_balance ÷ deposit_balance',
      unit: '比值',
      timeSemantics: '同一业务日期、同一分行的两个余额快照派生值。',
    },
  ],
  sources: [
    'AccountBalanceSnapshot（核心系统存款日终余额）',
    'LoanBalanceSnapshot（信贷系统最小教学事实）',
    'Branch（公共机构维度）',
  ],
  grain: 'business_date × branch_id',
  releasePrerequisite: '两套输入到齐、质量通过、Release 未被阻断，才可供消费者使用。',
}

export const capstoneCheckpoints = [
  {
    id: 'mission-brief' as const,
    label: 'Mission Brief',
    question: '谁在什么时候需要什么结果？',
    deliverable: '业务日期、08:00 SLA、消费者、三个指标和发布前提。',
  },
  {
    id: 'design' as const,
    label: 'Design',
    question: '两套事实怎样形成一份分行产品？',
    deliverable: '来源映射、指标口径、最终 Grain、假设和 Non-goals。',
  },
  {
    id: 'build' as const,
    label: 'Build',
    question: '如何从两个 Snapshot 产出目标结果？',
    deliverable: '分别聚合、公共维度、产品字段和幂等写入边界。',
  },
  {
    id: 'operate' as const,
    label: 'Operate',
    question: '日批何时运行、何时可用？',
    deliverable: 'DAG、依赖、business_date、运行状态和 08:00 SLA。',
  },
  {
    id: 'incident' as const,
    label: 'Incident',
    question: '事故发生后先做什么？',
    deliverable: '迟到输入和跨层对账事故的上下文、决策、后果与恢复路径。',
  },
  {
    id: 'investigate' as const,
    label: 'Investigate',
    question: '证据能把调查推进到哪里？',
    deliverable: 'Quality Event、血缘路径、根因候选和 Blast Radius。',
  },
  {
    id: 'deliver' as const,
    label: 'Deliver',
    question: '谁以什么方式消费？',
    deliverable: '经营报表 / BI 主契约，以及文件和 API 的扩展边界。',
  },
  {
    id: 'scale' as const,
    label: 'Scale',
    question: '规模上升后怎样在证据基础上改进？',
    deliverable: '一次有限优化、Before / After、复测和取舍。',
  },
  {
    id: 'launch-review' as const,
    label: 'Launch Review',
    question: '现在是否可以上线？',
    deliverable: 'READY、BLOCKED 或 READY WITH RISK 的工程式评审。',
  },
] as const

function withContract(
  base: TransformationTaskContract,
  overrides: Partial<TransformationTaskContract>,
): TransformationTaskContract {
  return { ...base, ...overrides }
}

function getTask(
  tasks: readonly SchedulerTaskDefinition[],
  taskId: string,
): SchedulerTaskDefinition {
  const task = tasks.find((candidate) => candidate.taskId === taskId)
  if (!task) {
    throw new Error(`Capstone Scheduler 缺少任务: ${taskId}`)
  }
  return task
}

/** Add only the Capstone loan path to the existing banking Scheduler task model. */
export function createCapstoneSchedulerTasks(): SchedulerTaskDefinition[] {
  const bankingTasks = createBankingSchedulerTasks(bankingDepositBalanceTaskContract)
  const branchTask = getTask(bankingTasks, BANKING_SCHEDULER_TASK_IDS.branch)
  const depositAdsTask = getTask(bankingTasks, BANKING_SCHEDULER_TASK_IDS.ads)

  const loanInputTask: SchedulerTaskDefinition = {
    taskId: 'prepare.loan-balance-snapshot.daily.v1',
    label: 'LoanBalanceSnapshot 到达',
    layer: 'ods',
    description: '接收信贷系统提供的 loan_id × snapshot_date 日终贷款余额事实。',
    dependsOn: [],
    contract: withContract(bankingDepositBalanceTaskContract, {
      taskId: 'prepare.loan-balance-snapshot.daily.v1',
      inputTables: ['LoanBalanceSnapshot'],
      outputTable: 'ods_loan_balance_snapshot',
      outputGrain: 'loan_id × snapshot_date',
      dependencies: [],
      rerunHint: `按 business_date = ${CAPSTONE_BUSINESS_DATE} 覆盖贷款快照分区。`,
    }),
    durationMinutes: 3,
    maxAttempts: 1,
    slaMinutes: 330,
  }

  const loanDwdTask: SchedulerTaskDefinition = {
    taskId: 'transform.loan-balance.detail.daily.v1',
    label: 'DWD 贷款余额明细',
    layer: 'dwd',
    description: '保留信贷系统最小事实，按 loan_id × snapshot_date 对齐分行键。',
    dependsOn: [loanInputTask.taskId],
    contract: withContract(bankingDepositBalanceTaskContract, {
      taskId: 'transform.loan-balance.detail.daily.v1',
      inputTables: [loanInputTask.contract.outputTable],
      outputTable: 'dwd_loan_balance_detail',
      outputGrain: 'loan_id × snapshot_date',
      dependencies: [loanInputTask.taskId],
      rerunHint: `只重算 business_date = ${CAPSTONE_BUSINESS_DATE} 的贷款明细分区。`,
    }),
    durationMinutes: 4,
    maxAttempts: 2,
    slaMinutes: 330,
  }

  const loanDwsTask: SchedulerTaskDefinition = {
    taskId: 'transform.loan-balance.topic.daily.v1',
    label: 'DWS 贷款余额主题',
    layer: 'dws',
    description: '先按 business_date × branch_id 汇总贷款日终余额。',
    dependsOn: [loanDwdTask.taskId],
    contract: withContract(bankingDepositBalanceTaskContract, {
      taskId: 'transform.loan-balance.topic.daily.v1',
      inputTables: [loanDwdTask.contract.outputTable, 'Branch'],
      outputTable: 'dws_loan_balance_daily',
      outputGrain: CAPSTONE_FINAL_GRAIN,
      dependencies: [loanDwdTask.taskId, branchTask.taskId],
      rerunHint: `按 business_date = ${CAPSTONE_BUSINESS_DATE} 覆盖贷款主题分区。`,
    }),
    durationMinutes: 5,
    maxAttempts: 2,
    slaMinutes: 330,
  }

  const finalTask: SchedulerTaskDefinition = {
    taskId: 'publish.branch-business-daily.v1',
    label: '发布 branch_business_daily',
    layer: 'ads',
    description: '汇合存款主题和贷款主题，写入分行日经营指标快照。',
    dependsOn: [depositAdsTask.taskId, loanDwsTask.taskId, branchTask.taskId],
    contract: withContract(bankingDepositBalanceTaskContract, {
      taskId: 'publish.branch-business-daily.v1',
      inputTables: [
        depositAdsTask.contract.outputTable,
        loanDwsTask.contract.outputTable,
        'Branch',
      ],
      outputTable: CAPSTONE_FINAL_PRODUCT_TABLE,
      outputGrain: CAPSTONE_FINAL_GRAIN,
      dependencies: [depositAdsTask.taskId, loanDwsTask.taskId, branchTask.taskId],
      rerunHint: `按 business_date = ${CAPSTONE_BUSINESS_DATE} 覆盖 branch_business_daily 目标分区。`,
    }),
    durationMinutes: 4,
    maxAttempts: 2,
    slaMinutes: 330,
  }

  return [...bankingTasks, loanInputTask, loanDwdTask, loanDwsTask, finalTask]
}

const capstoneSchedulerTasks = createCapstoneSchedulerTasks()

function buildSchedulerRun(
  tasks: readonly SchedulerTaskDefinition[],
  scenario: 'happy-path' | 'upstream-late',
): { terminal: SchedulerRunState; timeline: SchedulerRunState[] } {
  const initial = createInitialSchedulerRun(tasks, {
    businessDate: CAPSTONE_BUSINESS_DATE,
    scenario,
    scheduledAt: CAPSTONE_PROCESSING_STARTED_AT,
    maxConcurrentTasks: 8,
    lateDataAvailableAt: CAPSTONE_LOAN_ARRIVED_AT,
    lateDataDetectedAt: CAPSTONE_LOAN_ARRIVED_AT,
    lateDataTaskId: 'prepare.loan-balance-snapshot.daily.v1',
    runId: `run.capstone.branch-business.${scenario}`,
  })
  const timeline = buildSchedulerTimeline(initial)
  const terminal = timeline.at(-1)
  if (!terminal || (terminal.status !== 'success' && terminal.status !== 'failed')) {
    throw new Error(`Capstone Scheduler 未能到达终态: ${scenario}`)
  }
  return { terminal, timeline }
}

function createCapstoneSchedulerProjection(): CapstoneSchedulerProjection {
  const happy = buildSchedulerRun(capstoneSchedulerTasks, 'happy-path')
  const late = buildSchedulerRun(capstoneSchedulerTasks, 'upstream-late')
  return {
    tasks: capstoneSchedulerTasks,
    happyRun: happy.terminal,
    lateRun: late.terminal,
    lateTimeline: late.timeline,
    loanExpectedAt: CAPSTONE_LOAN_EXPECTED_AT,
    processingStartedAt: CAPSTONE_PROCESSING_STARTED_AT,
    loanArrivedAt: CAPSTONE_LOAN_ARRIVED_AT,
    deliverySlaAt: CAPSTONE_DELIVERY_SLA_AT,
    loanRerunPlan: createPartitionRerunPlan(
      capstoneSchedulerTasks,
      CAPSTONE_BUSINESS_DATE,
      'partial',
      'prepare.loan-balance-snapshot.daily.v1',
    ),
    backfillPlan: createPartitionRerunPlan(
      capstoneSchedulerTasks,
      CAPSTONE_BUSINESS_DATE,
      'full',
      'publish.branch-business-daily.v1',
    ),
  }
}

function createCapstoneQualityProjection(
  scheduler: CapstoneSchedulerProjection,
): CapstoneQualityProjection {
  const baseModel = createQualityTeachingModel()
  const model: QualityBankingModel = {
    ...baseModel,
    targetDate: CAPSTONE_BUSINESS_DATE,
    reconciliation: {
      ...baseModel.reconciliation,
      businessDate: CAPSTONE_BUSINESS_DATE,
      expectedDwdBalance: 12_000_000_000,
      observedDwsBalance: 11_800_000_000,
    },
  }
  const qualitySchedulerRun = createQualitySchedulerRun(
    scheduler.tasks,
    CAPSTONE_BUSINESS_DATE,
    'happy-path',
    CAPSTONE_PROCESSING_STARTED_AT,
  )
  const visualization = createDataQualityVisualization(qualitySchedulerRun, 'status', model)
  const failure = evaluateDataQuality(visualization, {
    scenario: 'balance-reconciliation-drift',
    action: 'block',
  })
  const recovery = evaluateDataQuality(visualization, {
    scenario: 'baseline',
    action: 'block',
  })
  const event = failure.events.find(
    (candidate) => candidate.ruleId === 'dq.dws.deposit-balance.reconciliation.v1',
  )
  if (!event) {
    throw new Error('Capstone 质量事故缺少跨层对账 Quality Event')
  }

  return {
    failure,
    recovery,
    event,
    reconciliation: {
      businessDate: CAPSTONE_BUSINESS_DATE,
      branch: '杭州分行',
      expectedDwdBalance: model.reconciliation.expectedDwdBalance,
      observedDwsBalance: model.reconciliation.observedDwsBalance,
      delta: model.reconciliation.observedDwsBalance - model.reconciliation.expectedDwdBalance,
    },
  }
}

function createLineageNode(
  id: string,
  label: string,
  layer: string,
  role: string,
  x: number,
  y: number,
  entityType: LineageNode['entityType'] = 'table',
): LineageNode {
  return { id, label, layer, role, x, y, entityType }
}

function createEvidence(source: LineageEvidenceSource, detail: string): LineageEvidence {
  return { source, detail }
}

function createCapstoneLineageProjection(
  quality: CapstoneQualityProjection,
): CapstoneLineageProjection {
  const nodes: LineageNode[] = [
    ...bankingLineageNodes,
    createLineageNode(
      CAPSTONE_LINEAGE_NODE_IDS.loanBalanceSnapshot,
      'LoanBalanceSnapshot',
      'SOURCE',
      '信贷系统贷款日终余额快照',
      90,
      550,
    ),
    createLineageNode(
      CAPSTONE_LINEAGE_NODE_IDS.loanTopic,
      'dws_loan_balance_daily',
      'DWS',
      '按 business_date × branch_id 汇总贷款余额',
      330,
      550,
    ),
    createLineageNode(
      CAPSTONE_LINEAGE_NODE_IDS.product,
      CAPSTONE_FINAL_PRODUCT_TABLE,
      'ADS',
      '跨系统分行经营指标快照',
      570,
      500,
    ),
    createLineageNode(
      CAPSTONE_LINEAGE_NODE_IDS.depositBalance,
      'branch_business_daily.deposit_balance',
      'FIELD',
      '核心系统存款余额汇总',
      760,
      420,
      'field',
    ),
    createLineageNode(
      CAPSTONE_LINEAGE_NODE_IDS.loanBalance,
      'branch_business_daily.loan_balance',
      'FIELD',
      '信贷系统贷款余额汇总',
      760,
      500,
      'field',
    ),
    createLineageNode(
      CAPSTONE_LINEAGE_NODE_IDS.ratio,
      'branch_business_daily.loan_deposit_ratio',
      'METRIC',
      '贷款余额 ÷ 存款余额',
      950,
      460,
      'metric',
    ),
    createLineageNode(
      CAPSTONE_LINEAGE_NODE_IDS.report,
      '经营报表 / BI',
      'CONSUMER',
      '主消费者',
      1130,
      380,
    ),
    createLineageNode(
      CAPSTONE_LINEAGE_NODE_IDS.file,
      '文件接口',
      'CONSUMER',
      '批量扩展消费者',
      1130,
      460,
    ),
    createLineageNode(
      CAPSTONE_LINEAGE_NODE_IDS.api,
      'API',
      'CONSUMER',
      '按需扩展消费者',
      1130,
      540,
    ),
  ]

  const sqlEvidence = createEvidence(
    'sql_transformation',
    '加工证据：两套 Snapshot 先分别按分行和业务日期聚合，再汇合为 branch_business_daily。',
  )
  const metricEvidence = createEvidence(
    'metric_definition',
    '指标定义证据：loan_deposit_ratio 使用同一业务日期和分行的两个余额字段计算。',
  )
  const consumerEvidence = createEvidence(
    'manual_metadata',
    '交付契约证据：报表 / BI 是主消费者，文件和 API 只消费已发布结果。',
  )
  const edges: LineageEdge[] = [
    ...bankingLineageEdges,
    {
      source: CAPSTONE_LINEAGE_NODE_IDS.loanBalanceSnapshot,
      target: CAPSTONE_LINEAGE_NODE_IDS.loanTopic,
      relation: 'transform',
      evidence: sqlEvidence,
      evidenceSource: sqlEvidence.source,
      verificationStatus: 'confirmed',
    },
    {
      source: CAPSTONE_LINEAGE_NODE_IDS.depositTopic,
      target: CAPSTONE_LINEAGE_NODE_IDS.product,
      relation: 'transform',
      evidence: sqlEvidence,
      evidenceSource: sqlEvidence.source,
      verificationStatus: 'confirmed',
    },
    {
      source: CAPSTONE_LINEAGE_NODE_IDS.loanTopic,
      target: CAPSTONE_LINEAGE_NODE_IDS.product,
      relation: 'transform',
      evidence: sqlEvidence,
      evidenceSource: sqlEvidence.source,
      verificationStatus: 'confirmed',
    },
    {
      source: CAPSTONE_LINEAGE_NODE_IDS.branch,
      target: CAPSTONE_LINEAGE_NODE_IDS.product,
      relation: 'depends_on',
      evidence: createEvidence(
        'task_dependency',
        'Branch 是两套事实汇总到分行视角时使用的公共维度。',
      ),
      evidenceSource: 'task_dependency',
      verificationStatus: 'confirmed',
    },
    {
      source: CAPSTONE_LINEAGE_NODE_IDS.product,
      target: CAPSTONE_LINEAGE_NODE_IDS.depositBalance,
      relation: 'derives',
      evidence: sqlEvidence,
      evidenceSource: sqlEvidence.source,
      verificationStatus: 'confirmed',
    },
    {
      source: CAPSTONE_LINEAGE_NODE_IDS.product,
      target: CAPSTONE_LINEAGE_NODE_IDS.loanBalance,
      relation: 'derives',
      evidence: sqlEvidence,
      evidenceSource: sqlEvidence.source,
      verificationStatus: 'confirmed',
    },
    {
      source: CAPSTONE_LINEAGE_NODE_IDS.depositBalance,
      target: CAPSTONE_LINEAGE_NODE_IDS.ratio,
      relation: 'derives',
      evidence: metricEvidence,
      evidenceSource: metricEvidence.source,
      verificationStatus: 'confirmed',
    },
    {
      source: CAPSTONE_LINEAGE_NODE_IDS.loanBalance,
      target: CAPSTONE_LINEAGE_NODE_IDS.ratio,
      relation: 'derives',
      evidence: metricEvidence,
      evidenceSource: metricEvidence.source,
      verificationStatus: 'confirmed',
    },
    ...[
      CAPSTONE_LINEAGE_NODE_IDS.report,
      CAPSTONE_LINEAGE_NODE_IDS.file,
      CAPSTONE_LINEAGE_NODE_IDS.api,
    ].flatMap((consumerId) => [
      {
        source: CAPSTONE_LINEAGE_NODE_IDS.product,
        target: consumerId,
        relation: 'consumes' as const,
        evidence: consumerEvidence,
        evidenceSource: consumerEvidence.source,
        verificationStatus: 'confirmed' as const,
      },
      {
        source: CAPSTONE_LINEAGE_NODE_IDS.ratio,
        target: consumerId,
        relation: 'consumes' as const,
        evidence: consumerEvidence,
        evidenceSource: consumerEvidence.source,
        verificationStatus: 'confirmed' as const,
      },
    ]),
  ]

  const investigationEvent = qualityEventToLineageInvestigation(quality.event)
  const investigation = analyzeLineageInvestigation(nodes, edges, investigationEvent)
  if (!investigation.path) {
    throw new Error('Capstone 血缘缺少 Quality Event 到指标的调查路径')
  }

  return { nodes, edges, investigationEvent }
}

function getBaseGovernanceAsset(): GovernanceAsset {
  const asset = governanceVisualizations.assetSelection.assets.find(
    (candidate) => candidate.id === 'dws-deposit-balance-daily',
  )
  if (!asset) {
    throw new Error('Capstone 需要复用已有 dws_deposit_balance_daily 治理资产')
  }
  return asset
}

const capstoneGovernanceFields: GovernanceField[] = [
  {
    name: 'business_date',
    label: '业务日期',
    type: 'date',
    description: '经营快照所属日期，不是输入到达平台的时间。',
    sensitivity: 'public',
  },
  {
    name: 'branch_id',
    label: '机构标识',
    type: 'string',
    description: 'Branch 公共维度的机构业务标识。',
    sensitivity: 'internal',
  },
  {
    name: 'deposit_balance',
    label: '存款余额',
    type: 'decimal',
    description: 'AccountBalanceSnapshot 在该业务日的分行汇总。',
    sensitivity: 'internal',
  },
  {
    name: 'loan_balance',
    label: '贷款余额',
    type: 'decimal',
    description: 'LoanBalanceSnapshot 在该业务日的分行汇总。',
    sensitivity: 'internal',
  },
  {
    name: 'loan_deposit_ratio',
    label: '存贷比',
    type: 'decimal | null',
    description: 'loan_balance ÷ deposit_balance；分母为零时为 NULL。',
    sensitivity: 'internal',
  },
]

function createGovernanceAsset(
  evidence: ReturnType<typeof qualityEventToGovernanceEvidence>,
  qualityStatus: 'pass' | 'unknown',
): GovernanceAsset {
  const baseAsset = getBaseGovernanceAsset()
  return {
    ...baseAsset,
    id: 'branch-business-daily',
    technicalName: CAPSTONE_FINAL_PRODUCT_TABLE,
    businessName: '跨系统分行经营分析数据产品',
    description:
      '把 AccountBalanceSnapshot 和 LoanBalanceSnapshot 按 Branch、business_date 汇合为经营指标快照。',
    owner: '经营分析组',
    tags: ['Capstone', 'branch_business_daily', '存款余额', '贷款余额', '存贷比'],
    qualityStatus,
    qualityNote:
      qualityStatus === 'pass'
        ? '同一业务日期的质量复检已经通过。'
        : '当前质量证据记录了失败事实，不能把 UNKNOWN 当作 PASS。',
    fields: capstoneGovernanceFields,
    businessDefinition: {
      summary: '一行代表一家 Branch 在一个 business_date 的跨系统经营指标快照。',
      grain: 'business_date × branch_id',
      scope: '经营报表 / BI 主路径，文件和 API 只消费已发布结果。',
      exclusions: '不保存账户、合同、借据或还款明细，不代表监管口径。',
    },
    definitionCompleteness: 'complete',
    lineageEvidence: {
      status: 'linked',
      nodeId: CAPSTONE_LINEAGE_NODE_IDS.product,
      note: '复用第 07 章血缘关系，并追加贷款事实和消费者路径。',
    },
    qualityEvidence: evidence,
  }
}

function createCapstoneGovernanceProjection(
  quality: CapstoneQualityProjection,
): CapstoneGovernanceProjection {
  const rule = quality.failure.checks.find((check) => check.ruleId === quality.event.ruleId)
  if (!rule) {
    throw new Error(`Capstone 治理适配找不到 Quality rule: ${quality.event.ruleId}`)
  }
  const ruleDefinition: Pick<QualityRuleDefinition, 'ruleId' | 'name' | 'severity' | 'target'> = {
    ruleId: rule.ruleId,
    name: 'DWD / DWS 按同一口径对账',
    severity: 'critical',
    target: quality.event.target,
  }
  const failureEvidence = qualityEventToGovernanceEvidence(
    quality.event,
    ruleDefinition.name,
    quality.failure.releaseDecision,
  )
  const recoveryEvidence = qualityEvaluationToGovernanceEvidence(quality.recovery, ruleDefinition)
  return {
    asset: createGovernanceAsset(failureEvidence, 'unknown'),
    recoveredAsset: createGovernanceAsset(recoveryEvidence, 'pass'),
    failureEvidence,
    recoveryEvidence,
  }
}

function createCapstoneDataServiceProjection(
  rows: readonly CapstoneSourceFacts['productRows'][number][],
  branches: readonly { branchId: string; branchName: string }[],
): CapstoneDataServiceProjection {
  const branchNames = new Map(branches.map((branch) => [branch.branchId, branch.branchName]))
  const publishedBalances: DataServicePublishedBalance[] = rows.map((row) => ({
    branchId: row.branch_id,
    branchName: branchNames.get(row.branch_id) ?? row.branch_id,
    businessDate: row.business_date,
    depositBalance: row.deposit_balance,
    previousDepositBalance: row.deposit_balance === 0 ? 0 : Math.round(row.deposit_balance * 0.97),
    currency: 'CNY',
    loanBalance: row.loan_balance,
    loanDepositRatio: row.loan_deposit_ratio,
    loanDepositRatioStatus: row.loan_deposit_ratio_status,
  }))
  const asset: DataServicePublishedAsset = {
    assetName: CAPSTONE_FINAL_PRODUCT_TABLE,
    label: '跨系统分行经营分析数据产品',
    businessDate: CAPSTONE_BUSINESS_DATE,
    status: 'Quality / Release 状态决定是否可消费',
    sourceLabel: 'AccountBalanceSnapshot + LoanBalanceSnapshot → branch_business_daily',
    grain: 'business_date × branch_id（一行代表一家分行的经营指标快照）',
  }
  const file: DataServiceFileDelivery = {
    dataFileName: 'branch_business_daily_20260930.txt',
    flagFileName: 'branch_business_daily_20260930.flag',
    businessDate: CAPSTONE_BUSINESS_DATE,
    delimiter: '|',
    encoding: 'UTF-8',
    fieldOrder: [
      'business_date',
      'branch_id',
      'deposit_balance',
      'loan_balance',
      'loan_deposit_ratio',
    ],
    deliveryType: 'full',
    transferHint: '这里只展示 TXT + FLAG 契约，不建设生产级传输平台。',
  }
  const api: DataServiceApiExample = {
    method: 'GET',
    route: '/api/branch-business-daily',
    defaultBranchId: 'B01',
    defaultBusinessDate: CAPSTONE_BUSINESS_DATE,
    parameters: [
      { key: 'branch_id', label: '机构', description: '要查询的 Branch 业务标识。' },
      { key: 'business_date', label: '业务日期', description: '经营快照所属的业务日期。' },
    ],
    responseFields: [
      'branch_id',
      'business_date',
      'deposit_balance',
      'loan_balance',
      'loan_deposit_ratio',
      'loan_deposit_ratio_status',
    ],
  }
  return { asset, publishedBalances, file, api }
}

function createCapstoneSourceFacts(): CapstoneSourceFacts {
  const depositSnapshots = depositBalanceDataset.accountBalanceSnapshots.filter(
    (snapshot) => snapshot.snapshotDate === CAPSTONE_BUSINESS_DATE,
  )
  const accounts = depositBalanceDataset.accounts
  const branches = capstoneBranches
  const productRows = buildBranchBusinessDaily(
    depositSnapshots,
    accounts,
    branches,
    capstoneLoanBalanceSnapshots,
    CAPSTONE_BUSINESS_DATE,
  )
  return {
    depositSnapshots,
    accounts,
    branches,
    loanSnapshots: capstoneLoanBalanceSnapshots,
    productRows,
  }
}

export function createCapstoneVisualization(): CapstoneVisualization {
  const scheduler = createCapstoneSchedulerProjection()
  const quality = createCapstoneQualityProjection(scheduler)
  const facts = createCapstoneSourceFacts()
  const lineage = createCapstoneLineageProjection(quality)
  const governance = createCapstoneGovernanceProjection(quality)
  const dataService = createCapstoneDataServiceProjection(facts.productRows, facts.branches)
  const performance = {
    diagnosis: performanceVisualizations.diagnosis,
    scanLayout: performanceVisualizations.scanLayout,
    tradeoffs: performanceVisualizations.tradeoffs,
  }

  return {
    kind: 'capstone',
    mission: capstoneMission,
    checkpoints: capstoneCheckpoints,
    facts,
    scheduler,
    quality,
    lineage,
    governance,
    dataService,
    performance,
  }
}

export const capstoneVisualization = createCapstoneVisualization()
export { capstoneMission }
