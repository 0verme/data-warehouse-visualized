import type { LineageEdge, LineageEvidence, LineageNode } from '../../types'
import type {
  LineageEvidenceRecord,
  LineageFieldDependency,
  LineageRootCauseCandidate,
  LineageTaskDependencyExample,
} from './types'
import { BANKING_SCHEDULER_TASK_IDS, bankingSchedulerVisualization } from '../scheduler/banking'

export const BANKING_LINEAGE_NODE_IDS = {
  accountBalanceSnapshot: 'account-balance-snapshot',
  account: 'account',
  customer: 'customer',
  product: 'product',
  branch: 'branch',
  dwd: 'dwd-account-balance-detail',
  dws: 'dws-deposit-balance-daily',
  ads: 'ads-deposit-balance',
  metric: 'metric-deposit-balance',
} as const

export const BANKING_LINEAGE_TASK_NODE_IDS = {
  accountBalanceSnapshot: 'task-account-balance-snapshot',
  account: 'task-account',
  customer: 'task-customer',
  product: 'task-product',
  branch: 'task-branch',
  dwd: 'task-dwd-balance',
  dws: 'task-dws-balance',
  ads: 'task-ads-balance',
} as const

const sourceNodes: LineageNode[] = [
  {
    id: BANKING_LINEAGE_NODE_IDS.accountBalanceSnapshot,
    label: 'AccountBalanceSnapshot',
    layer: 'SOURCE',
    role: '日终账户余额快照',
    x: 80,
    y: 70,
    entityType: 'table',
  },
  {
    id: BANKING_LINEAGE_NODE_IDS.account,
    label: 'Account',
    layer: 'SOURCE',
    role: '账户关联信息',
    x: 230,
    y: 70,
    entityType: 'table',
  },
  {
    id: BANKING_LINEAGE_NODE_IDS.customer,
    label: 'Customer',
    layer: 'SOURCE',
    role: '客户口径信息',
    x: 380,
    y: 70,
    entityType: 'table',
  },
  {
    id: BANKING_LINEAGE_NODE_IDS.product,
    label: 'Product',
    layer: 'SOURCE',
    role: '存款产品属性',
    x: 530,
    y: 70,
    entityType: 'table',
  },
  {
    id: BANKING_LINEAGE_NODE_IDS.branch,
    label: 'Branch',
    layer: 'SOURCE',
    role: '机构归属信息',
    x: 680,
    y: 70,
    entityType: 'table',
  },
]

const outputNodes: LineageNode[] = [
  {
    id: BANKING_LINEAGE_NODE_IDS.dwd,
    label: 'dwd_account_balance_detail',
    layer: 'DWD',
    role: '账户余额明细',
    x: 380,
    y: 180,
    entityType: 'table',
  },
  {
    id: BANKING_LINEAGE_NODE_IDS.dws,
    label: 'dws_deposit_balance_daily',
    layer: 'DWS',
    role: '按日期和业务维度汇总',
    x: 380,
    y: 280,
    entityType: 'table',
  },
  {
    id: BANKING_LINEAGE_NODE_IDS.ads,
    label: 'ads_deposit_balance',
    layer: 'ADS',
    role: '发布给业务使用的结果',
    x: 380,
    y: 380,
    entityType: 'table',
  },
  {
    id: BANKING_LINEAGE_NODE_IDS.metric,
    label: '存款余额指标',
    layer: 'METRIC',
    role: '最终业务消费者',
    x: 380,
    y: 440,
    entityType: 'metric',
  },
]

export const bankingLineageNodes: LineageNode[] = [...sourceNodes, ...outputNodes]

function createEvidence(source: LineageEvidence['source'], detail: string): LineageEvidence {
  return { source, detail }
}

const sourceToDwdEvidence = createEvidence(
  'sql_transformation',
  'SQL 加工证据：五份输入对齐为一行一个账户、一个快照日的 DWD 余额明细。',
)
const dwdToDwsEvidence = createEvidence(
  'sql_transformation',
  'SQL 加工证据：SUM(dwd_account_balance_detail.balance) 形成 DWS.deposit_balance。',
)
const dwsToAdsEvidence = createEvidence(
  'sql_transformation',
  'SQL 加工证据：ADS 读取 dws_deposit_balance_daily 的同一业务日期结果。',
)
const adsToMetricEvidence = createEvidence(
  'metric_definition',
  '指标定义证据：存款余额指标引用 ads_deposit_balance 的结果。',
)

export const bankingLineageEdges: LineageEdge[] = [
  ...sourceNodes.map((node) => ({
    source: node.id,
    target: BANKING_LINEAGE_NODE_IDS.dwd,
    relation: 'transform' as const,
    evidence: sourceToDwdEvidence,
    evidenceSource: sourceToDwdEvidence.source,
    verificationStatus: 'confirmed' as const,
    confidence: 'confirmed' as const,
  })),
  {
    source: BANKING_LINEAGE_NODE_IDS.dwd,
    target: BANKING_LINEAGE_NODE_IDS.dws,
    relation: 'transform',
    evidence: dwdToDwsEvidence,
    evidenceSource: dwdToDwsEvidence.source,
    verificationStatus: 'confirmed',
    confidence: 'confirmed',
  },
  {
    source: BANKING_LINEAGE_NODE_IDS.dws,
    target: BANKING_LINEAGE_NODE_IDS.ads,
    relation: 'transform',
    evidence: dwsToAdsEvidence,
    evidenceSource: dwsToAdsEvidence.source,
    verificationStatus: 'confirmed',
    confidence: 'confirmed',
  },
  {
    source: BANKING_LINEAGE_NODE_IDS.ads,
    target: BANKING_LINEAGE_NODE_IDS.metric,
    relation: 'consumes',
    evidence: adsToMetricEvidence,
    evidenceSource: adsToMetricEvidence.source,
    verificationStatus: 'confirmed',
    confidence: 'confirmed',
  },
]

export const bankingTableNodeIds = sourceNodes.concat(outputNodes).map((node) => node.id)

const dwdTask = bankingSchedulerVisualization.tasks.find(
  (task) => task.taskId === BANKING_SCHEDULER_TASK_IDS.dwd,
)
const dwsTask = bankingSchedulerVisualization.tasks.find(
  (task) => task.taskId === BANKING_SCHEDULER_TASK_IDS.dws,
)

if (!dwdTask || !dwsTask || !dwsTask.dependsOn.includes(dwdTask.taskId)) {
  throw new Error('银行存款余额血缘缺少 DWD → DWS 的 Scheduler dependency')
}

export const bankingTaskDependencyExample: LineageTaskDependencyExample = {
  upstreamTaskId: BANKING_LINEAGE_TASK_NODE_IDS.dwd,
  downstreamTaskId: BANKING_LINEAGE_TASK_NODE_IDS.dws,
  upstreamLabel: 'task_dwd_balance',
  downstreamLabel: 'task_dws_balance',
  evidence: createEvidence(
    'task_dependency',
    `任务配置证据：${dwsTask.taskId} 的 dependsOn 包含 ${dwdTask.taskId}，描述谁先跑。`,
  ),
  evidenceSource: 'task_dependency',
  verificationStatus: 'confirmed',
}

export const bankingFieldDependencies: LineageFieldDependency[] = [
  {
    id: 'field-dependency-balance-sum',
    kind: 'aggregate',
    label: '余额值来源',
    operation: 'SUM',
    sourceFields: ['dwd_account_balance_detail.balance'],
    targetFields: ['dws_deposit_balance_daily.deposit_balance'],
    path: [
      'dwd_account_balance_detail.balance',
      'SUM',
      'dws_deposit_balance_daily.deposit_balance',
    ],
    detail: 'DWD.balance 提供参与汇总的数值，SUM 是它到 DWS.deposit_balance 的转换证据。',
    evidence: createEvidence(
      'sql_transformation',
      'SQL 中存在 SUM(dwd_account_balance_detail.balance)，结果写入 dws_deposit_balance_daily.deposit_balance。',
    ),
    evidenceSource: 'sql_transformation',
    verificationStatus: 'confirmed',
  },
  {
    id: 'field-dependency-balance-rename',
    kind: 'rename',
    label: '字段重命名',
    operation: 'rename',
    sourceFields: ['dwd_account_balance_detail.balance'],
    targetFields: ['dws_deposit_balance_daily.deposit_balance'],
    path: [
      'dwd_account_balance_detail.balance',
      'rename',
      'dws_deposit_balance_daily.deposit_balance',
    ],
    detail: '字段名改变不会切断依赖；需要沿别名确认 balance 被写成 deposit_balance。',
    evidence: createEvidence(
      'sql_transformation',
      'SQL 输出别名把 balance 命名为 deposit_balance；字段名变化仍保留来源关系。',
    ),
    evidenceSource: 'sql_transformation',
    verificationStatus: 'confirmed',
  },
  {
    id: 'field-dependency-product-filter',
    kind: 'filter',
    label: '过滤范围',
    operation: 'FILTER',
    sourceFields: ['Product.product_type'],
    targetFields: ['dws_deposit_balance_daily.deposit_balance'],
    path: ['Product.product_type', 'FILTER', 'dws_deposit_balance_daily.deposit_balance'],
    detail: 'Product.product_type 不提供余额数值，却决定哪些产品的余额进入聚合范围。',
    evidence: createEvidence(
      'sql_transformation',
      'SQL 的 FILTER 使用 Product.product_type 决定进入聚合的余额集合。',
    ),
    evidenceSource: 'sql_transformation',
    verificationStatus: 'confirmed',
  },
  {
    id: 'field-dependency-branch-join',
    kind: 'join',
    label: '机构关联',
    operation: 'JOIN',
    sourceFields: ['dwd_account_balance_detail.branch_id', 'Branch.branch_id'],
    targetFields: ['dws_deposit_balance_daily.branch_id', '聚合输入集合'],
    path: [
      'dwd_account_balance_detail.branch_id',
      '+ Branch.branch_id',
      'JOIN',
      '聚合输入集合 / dws_deposit_balance_daily.branch_id',
    ],
    detail: 'Branch.branch_id 不直接贡献余额，但 JOIN 是否成功会改变进入聚合的账户集合。',
    evidence: createEvidence(
      'sql_transformation',
      'SQL JOIN 使用 dwd_account_balance_detail.branch_id = Branch.branch_id；关联不成功时，账户可能不进入聚合输入集合。',
    ),
    evidenceSource: 'sql_transformation',
    verificationStatus: 'confirmed',
  },
]

export const bankingRootCauseCandidates: LineageRootCauseCandidate[] = [
  {
    id: 'candidate-dwd-balance',
    entityId: BANKING_LINEAGE_NODE_IDS.dwd,
    label: 'DWD.balance 值来源异常',
    kind: 'value-source',
    evidence: bankingFieldDependencies[0].evidence,
    evidenceSource: bankingFieldDependencies[0].evidenceSource,
    verificationStatus: 'pending',
    confidence: 'inferred',
    evidencePath: bankingFieldDependencies[0].path,
    rationale: 'DWD.balance 已经异常时，DWS 的 SUM 只能把异常继续传递；应先对照 DWD 明细和源快照。',
  },
  {
    id: 'candidate-branch-join',
    entityId: BANKING_LINEAGE_NODE_IDS.branch,
    label: 'Branch JOIN 丢失账户',
    kind: 'join-dependency',
    evidence: bankingFieldDependencies[3].evidence,
    evidenceSource: bankingFieldDependencies[3].evidenceSource,
    verificationStatus: 'pending',
    confidence: 'inferred',
    evidencePath: bankingFieldDependencies[3].path,
    rationale: 'Branch 关联失败可能缩小聚合输入集合；它是 JOIN 依赖候选，不是已经证明的根因。',
  },
  {
    id: 'candidate-product-filter',
    entityId: BANKING_LINEAGE_NODE_IDS.product,
    label: 'Product.product_type 过滤变化',
    kind: 'filter-dependency',
    evidence: bankingFieldDependencies[2].evidence,
    evidenceSource: bankingFieldDependencies[2].evidenceSource,
    verificationStatus: 'pending',
    confidence: 'inferred',
    evidencePath: bankingFieldDependencies[2].path,
    rationale: '产品过滤条件变化会改变聚合范围；需要核对执行参数和 SQL 版本才能确认。',
  },
]

export const bankingEvidenceRecords: LineageEvidenceRecord[] = [
  {
    id: 'evidence-edge-dwd-balance-dws-balance',
    sourceEntityId: 'field-dwd-balance',
    targetEntityId: 'field-dws-deposit-balance',
    sourceLabel: 'dwd_account_balance_detail.balance',
    targetLabel: 'dws_deposit_balance_daily.deposit_balance',
    relation: 'transform',
    evidence: bankingFieldDependencies[0].evidence,
    evidenceSource: 'sql_transformation',
    verificationStatus: 'confirmed',
  },
  {
    id: 'evidence-edge-task-dwd-dwd',
    sourceEntityId: BANKING_LINEAGE_TASK_NODE_IDS.dwd,
    targetEntityId: BANKING_LINEAGE_NODE_IDS.dwd,
    sourceLabel: 'task_dwd_balance',
    targetLabel: 'dwd_account_balance_detail',
    relation: 'transform',
    evidence: createEvidence(
      'task_dependency',
      `任务配置 / 运行定义：${dwdTask.taskId} 负责产出 ${dwdTask.contract.outputTable}。`,
    ),
    evidenceSource: 'task_dependency',
    verificationStatus: 'confirmed',
  },
  {
    id: 'evidence-edge-ads-metric',
    sourceEntityId: BANKING_LINEAGE_NODE_IDS.ads,
    targetEntityId: BANKING_LINEAGE_NODE_IDS.metric,
    sourceLabel: 'ads_deposit_balance',
    targetLabel: '存款余额指标',
    relation: 'consumes',
    evidence: adsToMetricEvidence,
    evidenceSource: 'metric_definition',
    verificationStatus: 'confirmed',
  },
  {
    id: 'evidence-edge-manual-branch-metric',
    sourceEntityId: 'field-branch-id',
    targetEntityId: BANKING_LINEAGE_NODE_IDS.metric,
    sourceLabel: 'Branch.branch_id',
    targetLabel: '存款余额指标',
    relation: 'consumes',
    evidence: createEvidence(
      'manual_metadata',
      '人工登记的教学关系：曾有人记录 Branch.branch_id 会影响该指标，但目前没有对应 SQL 或指标定义可核对。',
    ),
    evidenceSource: 'manual_metadata',
    verificationStatus: 'pending',
  },
]
