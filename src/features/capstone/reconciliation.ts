import {
  QUALITY_RULE_IDS,
  createDataQualityVisualization,
  createQualitySchedulerRun,
  createQualityTeachingModel,
  evaluateDataQuality,
} from '../../utils/data-quality'
import type {
  QualityBankingModel,
  QualityCheckResult,
  QualityEvaluation,
} from '../data-quality/types'
import type { SchedulerRunState } from '../scheduler/types'
import { createCapstoneSchedulerTasks } from './scheduler'
import { CAPSTONE_BUSINESS_DATE, CAPSTONE_PROCESSING_STARTED_AT } from './constants'
import type {
  CapstoneQualityRepairAction,
  CapstoneQualityRecheck,
  CapstoneReconciliationConfig,
  CapstoneReconciliationDefect,
  CapstoneReconciliationRecompute,
} from './types'

/**
 * 跨层对账事故的教学数据粒度：DWD 存款明细按产品与机构分组后重聚合。
 * 固定事故：DWD 重聚合 120 亿、DWS 写入 118 亿、delta = -2 亿。
 */
interface CapstoneReconciliationGroup {
  groupId: string
  label: string
  productType: 'term' | 'demand'
  branchKey: string
  balance: number
}

const CAPSTONE_BRANCH_REFERENCE_KEYS: readonly string[] = ['B01']

export const CAPSTONE_RECONCILIATION_GROUPS: readonly CapstoneReconciliationGroup[] = [
  {
    groupId: 'term-hz',
    label: '定期存款 product_type = term · B01',
    productType: 'term',
    branchKey: 'B01',
    balance: 11_800_000_000,
  },
  {
    groupId: 'demand-hz',
    label: '活期存款 product_type = demand · B9999',
    productType: 'demand',
    branchKey: 'B9999',
    balance: 200_000_000,
  },
]

/** 事故数据当前只包含一个真实缺陷：产品过滤被收窄，活期存款没有进入 DWS 聚合。 */
export const CAPSTONE_INCIDENT_INITIAL_CONFIG: CapstoneReconciliationConfig = {
  defects: ['product-filter-over-restriction'],
}

export const CAPSTONE_REPAIR_ACTIONS: readonly CapstoneQualityRepairAction[] = [
  {
    id: 'repair-dwd-balance-value-source',
    target: 'value-source',
    clearsDefect: 'value-source-drift',
    label: '重读 DWD 余额值来源并重新聚合',
    detail:
      '按同一 business_date 从源快照重读 balance 并重聚合 DWD；跨层对账只能看到 DWD 与 DWS 的差额，值来源是否正确需要另做源快照对照。',
    rerunScope: '源快照 → DWD 存款明细 → DWS 主题（同一 business_date 分区）',
    candidateKeys: ['candidate-dwd-balance', 'dwd-account-balance-detail'],
  },
  {
    id: 'repair-branch-join-scope',
    target: 'branch-join',
    clearsDefect: 'branch-join-loss',
    label: '恢复 Branch JOIN 完整机构映射并重跑',
    detail:
      '用账户映射解析机构归属，而不是只依赖不完整的 Branch 参考表；重跑后比较进入聚合的账户集合是否变化。',
    rerunScope: 'DWD 存款明细 → DWS 存款主题（同一 business_date 分区）',
    candidateKeys: ['candidate-branch-join', 'branch'],
  },
  {
    id: 'repair-product-filter-scope',
    target: 'product-filter',
    clearsDefect: 'product-filter-over-restriction',
    label: '恢复产品过滤范围并重跑 DWS 聚合',
    detail: '把 product_type 过滤恢复为 term + demand，让被排除的活期存款余额重新进入聚合。',
    rerunScope: 'DWS 存款主题 → branch_business_daily（同一 business_date 分区）',
    candidateKeys: ['candidate-product-filter', 'product'],
  },
]

export function getCapstoneRepairAction(
  repairActionId: string | null,
): CapstoneQualityRepairAction | null {
  if (!repairActionId) return null
  return CAPSTONE_REPAIR_ACTIONS.find((action) => action.id === repairActionId) ?? null
}

export function getCapstoneRepairActionForCandidate(
  candidateId: string | null,
): CapstoneQualityRepairAction | null {
  if (!candidateId) return null
  return (
    CAPSTONE_REPAIR_ACTIONS.find((action) => action.candidateKeys.includes(candidateId)) ?? null
  )
}

/** 事故数据中真实存在的缺陷对应的修复动作；用于 Governance 的已修复参考模板。 */
export function getCapstoneIncidentRootRepairAction(): CapstoneQualityRepairAction {
  const action = CAPSTONE_REPAIR_ACTIONS.find((candidate) =>
    CAPSTONE_INCIDENT_INITIAL_CONFIG.defects.includes(candidate.clearsDefect),
  )
  if (!action) {
    throw new Error('Capstone 事故配置缺少可以修复的缺陷')
  }
  return action
}

export function hasCapstoneDefect(
  config: CapstoneReconciliationConfig,
  defect: CapstoneReconciliationDefect,
): boolean {
  return config.defects.includes(defect)
}

/** 只改写加工配置，不直接写结果；结果必须由 recompute 重新计算。 */
export function applyCapstoneRepair(
  config: CapstoneReconciliationConfig,
  action: CapstoneQualityRepairAction,
): { config: CapstoneReconciliationConfig; changes: readonly string[] } {
  const hadDefect = hasCapstoneDefect(config, action.clearsDefect)
  const nextConfig: CapstoneReconciliationConfig = {
    defects: config.defects.filter((defect) => defect !== action.clearsDefect),
  }
  const changes = hadDefect
    ? [`已修复 ${action.target}：${action.detail}`]
    : [`已执行 ${action.target}：该维度在本次事故数据中没有缺陷，Rerun 后进入聚合的输入集合不变。`]
  return { config: nextConfig, changes }
}

function isGroupExcludedFromDws(
  group: CapstoneReconciliationGroup,
  config: CapstoneReconciliationConfig,
): string | null {
  if (
    hasCapstoneDefect(config, 'product-filter-over-restriction') &&
    group.productType !== 'term'
  ) {
    return 'product_type 过滤收窄，活期存款没有进入聚合'
  }

  if (
    hasCapstoneDefect(config, 'branch-join-loss') &&
    !CAPSTONE_BRANCH_REFERENCE_KEYS.includes(group.branchKey)
  ) {
    return `Branch JOIN 只使用参考表，找不到机构 ${group.branchKey}`
  }

  return null
}

/**
 * apply transformation 之后重新计算对账数据状态。
 *
 * `value-source-drift` 不改变跨层 delta：DWD 与 DWS 继承同一份源快照，
 * 这条规则只能看到两层之间的差额。值来源是否正确需要源快照对照，
 * 因此修复值来源不会让 reconciliation invariant 通过。
 */
export function recomputeCapstoneReconciliation(
  config: CapstoneReconciliationConfig,
): CapstoneReconciliationRecompute {
  const groups = CAPSTONE_RECONCILIATION_GROUPS.map((group) => {
    const excludedReason = isGroupExcludedFromDws(group, config)
    return {
      groupId: group.groupId,
      label: group.label,
      balance: group.balance,
      includedInDws: excludedReason === null,
      excludedReason,
    }
  })

  const dwdReaggregated = CAPSTONE_RECONCILIATION_GROUPS.reduce(
    (sum, group) => sum + group.balance,
    0,
  )
  const dwsWritten = groups.reduce(
    (sum, group, index) =>
      group.includedInDws ? sum + (CAPSTONE_RECONCILIATION_GROUPS[index]?.balance ?? 0) : sum,
    0,
  )

  return {
    config,
    dwdReaggregated,
    dwsWritten,
    delta: dwsWritten - dwdReaggregated,
    groups,
  }
}

let cachedIncidentSchedulerRun: SchedulerRunState | null = null

function getIncidentSchedulerRun(): SchedulerRunState {
  cachedIncidentSchedulerRun ??= createQualitySchedulerRun(
    createCapstoneSchedulerTasks(),
    CAPSTONE_BUSINESS_DATE,
    'happy-path',
    CAPSTONE_PROCESSING_STARTED_AT,
  )
  return cachedIncidentSchedulerRun
}

export interface CapstoneIncidentQualityEvaluation {
  recompute: CapstoneReconciliationRecompute
  evaluation: QualityEvaluation
}

/** 复用既有数据质量引擎：把重算后的 expected / observed 放进模型，再重新执行规则。 */
export function createCapstoneIncidentQualityEvaluation(
  config: CapstoneReconciliationConfig,
): CapstoneIncidentQualityEvaluation {
  const recompute = recomputeCapstoneReconciliation(config)
  const baseModel = createQualityTeachingModel()
  const model: QualityBankingModel = {
    ...baseModel,
    targetDate: CAPSTONE_BUSINESS_DATE,
    reconciliation: {
      ...baseModel.reconciliation,
      businessDate: CAPSTONE_BUSINESS_DATE,
      expectedDwdBalance: recompute.dwdReaggregated,
      observedDwsBalance: recompute.dwsWritten,
    },
  }
  const visualization = createDataQualityVisualization(getIncidentSchedulerRun(), 'status', model)
  const evaluation = evaluateDataQuality(visualization, {
    scenario: 'balance-reconciliation-drift',
    action: 'block',
  })
  return { recompute, evaluation }
}

export function getCapstoneReconciliationCheck(evaluation: QualityEvaluation): QualityCheckResult {
  const check = evaluation.checks.find(
    (candidate) => candidate.ruleId === QUALITY_RULE_IDS.reconciliation,
  )
  if (!check) {
    throw new Error('Capstone 复检缺少跨层对账 Quality Check')
  }
  return check
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('zh-CN')} 元`
}

function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toLocaleString('zh-CN')} 元`
}

function formatThreshold(check: QualityCheckResult): string {
  const operator =
    check.threshold.operator === 'at-most'
      ? '≤'
      : check.threshold.operator === 'at-least'
        ? '≥'
        : '='
  const warning =
    check.threshold.warningRange === undefined
      ? ''
      : `（warning range ${formatAmount(check.threshold.warningRange)}）`
  return `${operator} ${formatAmount(check.threshold.value)}${warning}`
}

/**
 * 对一次候选修复执行 apply → recompute → 质量复检。
 * 每次修复都从同一份事故数据重新执行，因此结果与尝试顺序无关。
 */
export function evaluateCapstoneQualityRepair(
  repairActionId: string | null,
): CapstoneQualityRecheck | null {
  const action = getCapstoneRepairAction(repairActionId)
  if (!action) return null

  const initial = createCapstoneIncidentQualityEvaluation(CAPSTONE_INCIDENT_INITIAL_CONFIG)
  const applied = applyCapstoneRepair(CAPSTONE_INCIDENT_INITIAL_CONFIG, action)
  const { recompute, evaluation } = createCapstoneIncidentQualityEvaluation(applied.config)
  const check = getCapstoneReconciliationCheck(evaluation)
  const passed = check.status === 'pass'

  const evidence = [
    `同一 business_date = ${CAPSTONE_BUSINESS_DATE} 重新执行 DWD 重聚合与 DWS 写入。`,
    `DWD 重聚合 = ${formatAmount(recompute.dwdReaggregated)}。`,
    `DWS 写入：${formatAmount(initial.recompute.dwsWritten)} → ${formatAmount(recompute.dwsWritten)}。`,
    `delta = ${formatDelta(recompute.delta)}；阈值 ${formatThreshold(check)}。`,
    `Quality status = ${check.status} · Release = ${evaluation.releaseDecision.status}。`,
  ]

  return {
    repairActionId: action.id,
    repairLabel: action.label,
    candidateVerdict: passed ? 'confirmed' : 'rejected',
    ruleId: check.ruleId,
    expected: check.expected,
    observed: check.observed,
    expectedBalance: recompute.dwdReaggregated,
    observedBalanceBefore: initial.recompute.dwsWritten,
    observedBalanceAfter: recompute.dwsWritten,
    delta: recompute.delta,
    threshold: check.threshold,
    status: check.status,
    releaseStatus: evaluation.releaseDecision.status,
    appliedChanges: applied.changes,
    evidence,
  }
}
