/**
 * 生产实践案例 13-1 · 生命周期执行路径 fixture。
 *
 * 教学场景：`AccountBalanceSnapshot` 的日批任务在 Day 1（目标对象不存在）
 * 走 initialize 成功，在 Day 2（目标对象已存在）因 `maintain.prepare`
 * 没有准备当前 `business_date` 的写入单元而失败。
 *
 * 这里只承载确定性状态与证据语义：所有 Evidence Panel 数值、5 项验证结果
 * 都由 model 中的纯函数计算，组件与课程正文不硬编码结论。
 */

export interface AccountBalanceFixtureAccount {
  readonly accountId: string
  readonly day1Balance: number
  readonly day2Balance: number
}

export interface AccountBalanceFixture {
  readonly taskName: string
  readonly targetName: string
  /** 教学 Grain 声明：一行 = 一个账户在一个快照日的余额状态。 */
  readonly grain: string
  readonly day1BusinessDate: string
  readonly day2BusinessDate: string
  readonly accounts: readonly AccountBalanceFixtureAccount[]
}

export interface AccountBalanceSnapshotRow {
  readonly accountId: string
  readonly snapshotDate: string
  readonly balance: number
}

/**
 * 目标对象在某个时刻的状态。
 *
 * `writeUnits` 是「当前业务日期的写入单元」的抽象：教学案例中可以把它理解为
 * 按 `snapshot_date` 组织的日期分区或等价写入单元，不展开具体数据库语法。
 */
export interface LifecycleDataset {
  readonly targetExists: boolean
  readonly writeUnits: readonly string[]
  readonly rows: readonly AccountBalanceSnapshotRow[]
}

export type LifecyclePath = 'initialize' | 'maintain'
export type LifecycleJobStatus = 'SUCCESS' | 'FAILED'
export type LifecyclePhase = 'prepare' | 'write'
export type TargetState = 'missing' | 'exists'

export interface LifecycleDayRun {
  readonly day: 1 | 2
  readonly businessDate: string
  /** 本次运行开始之前目标对象是否存在。 */
  readonly targetBefore: TargetState
  /** 实际进入的生命周期路径。 */
  readonly path: LifecyclePath
  /** 运行推进到的最远阶段：Day 2 失败时停在 prepare。 */
  readonly phase: LifecyclePhase
  readonly jobStatus: LifecycleJobStatus
  readonly rowsWritten: number
  /** Day 2 prepare 失败暴露出的规则缺口；成功后为 null。 */
  readonly failure: string | null
  /** 是否在「目标对象已经存在」条件下单独验证过 maintain。 */
  readonly maintainValidated: boolean
  /** 目标对象是否被 maintain 路径重新创建。 */
  readonly targetRecreated: boolean
  /** 是否已经执行过同 business_date 的 Rerun。 */
  readonly rerunExecuted: boolean
}

export interface SnapshotIdempotencyResult {
  readonly businessDate: string
  readonly rowsBefore: number
  readonly rowsAfter: number
  readonly added: number
  readonly identical: boolean
}

export interface SnapshotVerificationCheck {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly passed: boolean
}

export interface LifecycleSnapshotState {
  readonly day1: LifecycleDayRun
  readonly day2: LifecycleDayRun
  readonly dataset: LifecycleDataset
  readonly verification: readonly SnapshotVerificationCheck[]
  readonly idempotency: SnapshotIdempotencyResult | null
}

export type LifecycleEvidenceState = 'neutral' | 'success' | 'danger' | 'accent' | 'muted'

export type LifecycleEvidenceField =
  'Job Status' | 'business_date' | 'Target Exists' | 'Current Phase' | 'Rows Written'

export interface LifecycleEvidenceRow {
  readonly field: LifecycleEvidenceField
  readonly value: string
  readonly state: LifecycleEvidenceState
}

/** Step 4 之后才展开的路径内部步骤。 */
export type LifecyclePathStepState = 'done' | 'failed' | 'pending'

export interface LifecyclePathStep {
  readonly id: string
  readonly label: string
  readonly state: LifecyclePathStepState
  readonly detail: string | null
}

export type LifecyclePathStepKind =
  'symptom' | 'evidence' | 'divergence' | 'diagnose' | 'fix' | 'rerun' | 'prevent'

/** 每一步只打开当前判断所需的证据，不提前泄露根因。 */
export interface LifecyclePathReveal {
  readonly run: boolean
  readonly target: boolean
  readonly writeUnit: boolean
  readonly fix: boolean
  readonly rerun: boolean
  readonly verification: boolean
  readonly matrix: boolean
}

export interface LifecyclePathHighlight {
  readonly kind: LifecyclePathStepKind
  readonly focus: 'both' | 'day1' | 'day2'
  readonly risk: boolean
  readonly reveal: LifecyclePathReveal
}

/** Lesson section payload：案例的 fixture 与 Step Kernel 自包含。 */
export interface LifecyclePathVisualization {
  readonly kind: 'lifecycle-path'
}
