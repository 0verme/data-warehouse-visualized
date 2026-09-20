/**
 * 生产实践案例 13-1 · 生命周期状态与证据纯函数。
 *
 * 状态推进顺序是固定的：
 *   initialize（Day 1） → maintain 失败（Day 2） → 修正规则后单独验证 → 同 business_date Rerun
 *
 * 所有 Evidence Panel 值、5 项验证与幂等结果都从这里的函数计算，
 * 组件只负责按 Step 的 reveal 语义展示。
 */

import type {
  AccountBalanceFixture,
  AccountBalanceSnapshotRow,
  LifecycleDataset,
  LifecycleDayRun,
  LifecycleEvidenceRow,
  LifecycleEvidenceState,
  LifecyclePathReveal,
  LifecyclePathStep,
  SnapshotIdempotencyResult,
  SnapshotVerificationCheck,
} from './types'

export const accountBalanceSnapshotFixture: AccountBalanceFixture = {
  taskName: 'build.account-balance-snapshot.daily',
  targetName: 'AccountBalanceSnapshot',
  grain: 'Account × snapshot_date',
  day1BusinessDate: '2026-09-18',
  day2BusinessDate: '2026-09-19',
  accounts: [
    { accountId: 'A001', day1Balance: 128400, day2Balance: 131050 },
    { accountId: 'A002', day1Balance: 76800, day2Balance: 74300 },
    { accountId: 'A003', day1Balance: 245600, day2Balance: 250100 },
    { accountId: 'A004', day1Balance: 18900, day2Balance: 21500 },
    { accountId: 'A005', day1Balance: 96300, day2Balance: 93900 },
    { accountId: 'A006', day1Balance: 310200, day2Balance: 315700 },
  ],
}

/**
 * maintain.prepare 的规则缺口：把「目标对象已经存在」误当成
 * 「当前 business_date 的写入单元已经就绪」。
 */
export const MAINTAIN_PREPARE_RULE_GAP =
  'maintain.prepare 假设「目标对象已经存在」等于「当前 business_date 的写入单元已经就绪」，缺少确保当前 business_date 写入单元存在的规则。'

export function createEmptyDataset(): LifecycleDataset {
  return { targetExists: false, writeUnits: [], rows: [] }
}

export function buildSnapshotRows(
  fixture: AccountBalanceFixture,
  businessDate: string,
  balanceKey: 'day1Balance' | 'day2Balance',
): readonly AccountBalanceSnapshotRow[] {
  return fixture.accounts.map((account) => ({
    accountId: account.accountId,
    snapshotDate: businessDate,
    balance: account[balanceKey],
  }))
}

export function getRowsForDate(
  rows: readonly AccountBalanceSnapshotRow[],
  snapshotDate: string,
): readonly AccountBalanceSnapshotRow[] {
  return rows.filter((row) => row.snapshotDate === snapshotDate)
}

function compareRows(left: AccountBalanceSnapshotRow, right: AccountBalanceSnapshotRow): number {
  return (
    left.snapshotDate.localeCompare(right.snapshotDate) ||
    left.accountId.localeCompare(right.accountId) ||
    left.balance - right.balance
  )
}

export function sameSnapshotRows(
  left: readonly AccountBalanceSnapshotRow[],
  right: readonly AccountBalanceSnapshotRow[],
): boolean {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort(compareRows)
  const sortedRight = [...right].sort(compareRows)

  return sortedLeft.every((row, index) => {
    const other = sortedRight[index]
    return (
      other !== undefined &&
      row.accountId === other.accountId &&
      row.snapshotDate === other.snapshotDate &&
      row.balance === other.balance
    )
  })
}

/** Day 1 · initialize：创建目标对象，并顺带初始化第一个日期写入单元。 */
export function runInitialize(fixture: AccountBalanceFixture): LifecycleDataset {
  return {
    targetExists: true,
    writeUnits: [fixture.day1BusinessDate],
    rows: buildSnapshotRows(fixture, fixture.day1BusinessDate, 'day1Balance'),
  }
}

/** 修正后的准备规则：由 business_date 推导并确保当前写入单元存在。 */
export function ensureWriteUnit(dataset: LifecycleDataset, businessDate: string): LifecycleDataset {
  if (dataset.writeUnits.includes(businessDate)) {
    return dataset
  }

  return {
    ...dataset,
    writeUnits: [...dataset.writeUnits, businessDate].sort((left, right) =>
      left.localeCompare(right),
    ),
  }
}

/**
 * 按 business_date 覆盖该日写入单元：同一业务日期重复执行时结果保持同一份，
 * 这就是本案例声明的既定幂等策略。
 */
export function writeSnapshot(
  fixture: AccountBalanceFixture,
  dataset: LifecycleDataset,
  businessDate: string,
  balanceKey: 'day1Balance' | 'day2Balance',
): LifecycleDataset {
  const prepared = ensureWriteUnit(dataset, businessDate)
  const keptRows = prepared.rows.filter((row) => row.snapshotDate !== businessDate)

  return {
    targetExists: prepared.targetExists,
    writeUnits: prepared.writeUnits,
    rows: [...keptRows, ...buildSnapshotRows(fixture, businessDate, balanceKey)],
  }
}

export interface MaintainAttempt {
  readonly dataset: LifecycleDataset
  readonly rowsWritten: number
  readonly ruleGap: string | null
}

/**
 * Day 2 缺陷路径：目标对象已经存在，进入 maintain，但 prepare 没有检查
 * 当前 business_date 的写入单元，运行停在 prepare，write 未执行。
 */
export function runMaintainBeforeFix(
  fixture: AccountBalanceFixture,
  dataset: LifecycleDataset,
): MaintainAttempt {
  const requiredUnitReady = dataset.writeUnits.includes(fixture.day2BusinessDate)

  if (requiredUnitReady) {
    return { dataset, rowsWritten: 0, ruleGap: null }
  }

  return { dataset, rowsWritten: 0, ruleGap: MAINTAIN_PREPARE_RULE_GAP }
}

export interface MaintainValidation {
  readonly dataset: LifecycleDataset
  readonly preparePassed: boolean
  readonly targetRecreated: boolean
}

/**
 * 处理步骤中的单独验证：只执行修正后的 maintain 准备规则。
 * prepare 通过后写入单元已经就绪，但这一步仍然不写数据；
 * 目标对象在整个过程中不会被重新创建。
 */
export function validateMaintainWithFix(
  fixture: AccountBalanceFixture,
  dataset: LifecycleDataset,
): MaintainValidation {
  const prepared = ensureWriteUnit(dataset, fixture.day2BusinessDate)

  return {
    dataset: prepared,
    preparePassed: prepared.writeUnits.includes(fixture.day2BusinessDate),
    targetRecreated: !dataset.targetExists && prepared.targetExists,
  }
}

export interface SnapshotRerunResult {
  readonly dataset: LifecycleDataset
  readonly idempotency: SnapshotIdempotencyResult
}

/**
 * 对同一 business_date 先做一次 Rerun，再重复执行一次来检验幂等。
 * 第一次 Rerun 的结果作为第 6 步展示状态；第二次只用于幂等证据。
 */
export function rerunSameBusinessDate(
  fixture: AccountBalanceFixture,
  dataset: LifecycleDataset,
): SnapshotRerunResult {
  const firstRerun = writeSnapshot(fixture, dataset, fixture.day2BusinessDate, 'day2Balance')
  const secondRerun = writeSnapshot(fixture, firstRerun, fixture.day2BusinessDate, 'day2Balance')

  return {
    dataset: firstRerun,
    idempotency: {
      businessDate: fixture.day2BusinessDate,
      rowsBefore: firstRerun.rows.length,
      rowsAfter: secondRerun.rows.length,
      added: secondRerun.rows.length - firstRerun.rows.length,
      identical: sameSnapshotRows(firstRerun.rows, secondRerun.rows),
    },
  }
}

/** 5 项数据验证：每项都携带由当前 dataset 计算出的实际数值。 */
export function verifySnapshot(
  fixture: AccountBalanceFixture,
  dataset: LifecycleDataset,
  day1Baseline: readonly AccountBalanceSnapshotRow[],
  idempotency: SnapshotIdempotencyResult,
): readonly SnapshotVerificationCheck[] {
  const day1Rows = getRowsForDate(dataset.rows, fixture.day1BusinessDate)
  const day2Rows = getRowsForDate(dataset.rows, fixture.day2BusinessDate)
  const uniqueGrainKeys = new Set(dataset.rows.map((row) => `${row.accountId}|${row.snapshotDate}`))
  const duplicateCount = dataset.rows.length - uniqueGrainKeys.size
  const historyPreserved = sameSnapshotRows(day1Baseline, day1Rows)

  return [
    {
      id: 'snapshot-exists',
      label: `${fixture.day2BusinessDate} 对应的 AccountBalanceSnapshot 已存在`,
      detail: `实际 ${day2Rows.length} 行`,
      passed: day2Rows.length > 0,
    },
    {
      id: 'grain-stable',
      label: 'Grain 仍为 Account × snapshot_date',
      detail: `${uniqueGrainKeys.size} 个 (account_id, snapshot_date) 对应 ${dataset.rows.length} 行`,
      passed: uniqueGrainKeys.size === dataset.rows.length,
    },
    {
      id: 'no-duplicates',
      label: '没有重复快照',
      detail: `重复 (account_id, snapshot_date) 共 ${duplicateCount} 行`,
      passed: duplicateCount === 0,
    },
    {
      id: 'history-preserved',
      label: `${fixture.day1BusinessDate} 历史数据没有被误删或覆盖`,
      detail: historyPreserved
        ? `Day 1 ${day1Rows.length} 行余额与运行时一致`
        : `Day 1 现有 ${day1Rows.length} 行与运行时基线不一致`,
      passed: historyPreserved && day1Rows.length === day1Baseline.length,
    },
    {
      id: 'rerun-idempotent',
      label: '同一 business_date 再执行一次符合既定幂等策略',
      detail: `${idempotency.businessDate} 重跑后仍 ${idempotency.rowsAfter} 行，新增 ${idempotency.added} 行`,
      passed: idempotency.identical && idempotency.added === 0,
    },
  ]
}

export function createDay1Run(
  fixture: AccountBalanceFixture,
  dataset: LifecycleDataset,
): LifecycleDayRun {
  return {
    day: 1,
    businessDate: fixture.day1BusinessDate,
    targetBefore: 'missing',
    path: 'initialize',
    phase: 'write',
    jobStatus: 'SUCCESS',
    rowsWritten: getRowsForDate(dataset.rows, fixture.day1BusinessDate).length,
    failure: null,
    maintainValidated: false,
    targetRecreated: false,
    rerunExecuted: false,
  }
}

export function createDay2FailedRun(fixture: AccountBalanceFixture): LifecycleDayRun {
  return {
    day: 2,
    businessDate: fixture.day2BusinessDate,
    targetBefore: 'exists',
    path: 'maintain',
    phase: 'prepare',
    jobStatus: 'FAILED',
    rowsWritten: 0,
    failure: MAINTAIN_PREPARE_RULE_GAP,
    maintainValidated: false,
    targetRecreated: false,
    rerunExecuted: false,
  }
}

export function createDay2ValidatedRun(
  fixture: AccountBalanceFixture,
  dataset: LifecycleDataset,
): LifecycleDayRun {
  return {
    ...createDay2FailedRun(fixture),
    rowsWritten: getRowsForDate(dataset.rows, fixture.day2BusinessDate).length,
    maintainValidated: true,
  }
}

export function createDay2RerunRun(
  fixture: AccountBalanceFixture,
  dataset: LifecycleDataset,
): LifecycleDayRun {
  return {
    ...createDay2FailedRun(fixture),
    phase: 'write',
    jobStatus: 'SUCCESS',
    rowsWritten: getRowsForDate(dataset.rows, fixture.day2BusinessDate).length,
    failure: null,
    maintainValidated: true,
    rerunExecuted: true,
  }
}

function getPhaseLabel(day: LifecycleDayRun): string {
  if (day.maintainValidated && !day.rerunExecuted) {
    return 'prepare ✓（已单独验证）'
  }

  if (day.phase === 'prepare') {
    return day.jobStatus === 'FAILED' ? 'prepare（失败）' : 'prepare'
  }

  return 'write（完成）'
}

function getPhaseState(day: LifecycleDayRun): LifecycleEvidenceState {
  if (day.maintainValidated && !day.rerunExecuted) {
    return 'accent'
  }

  if (day.phase === 'prepare') {
    return day.jobStatus === 'FAILED' ? 'danger' : 'neutral'
  }

  return 'success'
}

function evidenceRow(
  field: LifecycleEvidenceRow['field'],
  value: string,
  state: LifecycleEvidenceState,
): LifecycleEvidenceRow {
  return { field, value, state }
}

/**
 * Evidence Panel 的 5 个字段。`reveal` 由 Step 决定：
 * Step 1 只有 Job Status；Step 2 打开运行信息；Step 3 才打开目标对象状态。
 */
export function getDayEvidence(
  day: LifecycleDayRun,
  reveal: LifecyclePathReveal,
): readonly LifecycleEvidenceRow[] {
  return [
    evidenceRow('Job Status', day.jobStatus, day.jobStatus === 'SUCCESS' ? 'success' : 'danger'),
    evidenceRow(
      'business_date',
      reveal.run ? day.businessDate : '—',
      reveal.run ? 'accent' : 'muted',
    ),
    evidenceRow(
      'Target Exists',
      reveal.target ? (day.targetBefore === 'exists' ? 'Yes' : 'No') : '—',
      reveal.target ? 'accent' : 'muted',
    ),
    evidenceRow(
      'Current Phase',
      reveal.run ? getPhaseLabel(day) : '—',
      reveal.run ? getPhaseState(day) : 'muted',
    ),
    evidenceRow(
      'Rows Written',
      reveal.run ? String(day.rowsWritten) : '—',
      reveal.run ? (day.rowsWritten > 0 ? 'success' : 'neutral') : 'muted',
    ),
  ]
}

export interface LifecycleInputEvidence {
  readonly label: string
  readonly value: string
  readonly detail: string
}

/** Step 2 的第一批证据：输入、到达与失败边界，全部由 fixture 与 Day 2 状态推导。 */
export function getInputEvidence(
  fixture: AccountBalanceFixture,
  day2: LifecycleDayRun,
): readonly LifecycleInputEvidence[] {
  return [
    {
      label: '输入结构 / 契约',
      value: '两天一致',
      detail: `${fixture.accounts.length} 个账户的字段与顺序未变化`,
    },
    {
      label: '源端数据',
      value: '已正常到达',
      detail: `两天都能读取到 ${fixture.accounts.length} 个账户`,
    },
    {
      label: 'Day 2 失败边界',
      value: '正式写入之前',
      detail: `停在 ${day2.phase}，rows written = ${day2.rowsWritten}`,
    },
  ]
}

export function getDayPathSteps(
  day: LifecycleDayRun,
  fixture: AccountBalanceFixture,
): readonly LifecyclePathStep[] {
  if (day.day === 1) {
    return [
      { id: 'create-target', label: '创建目标对象', state: 'done', detail: null },
      {
        id: 'prepare-unit',
        label: `初始化 ${fixture.day1BusinessDate} 写入单元`,
        state: 'done',
        detail: null,
      },
      {
        id: 'write',
        label: `写入 ${fixture.targetName}`,
        state: 'done',
        detail: `${day.rowsWritten} 行`,
      },
    ]
  }

  const prepareDone = day.maintainValidated || day.phase === 'write'
  const writeDone = day.phase === 'write'

  return [
    {
      id: 'keep-target',
      label: '目标对象已存在，不重新创建',
      state: 'done',
      detail: day.targetRecreated ? '被重新创建' : '未重新创建',
    },
    {
      id: 'prepare-unit',
      label: `准备 ${fixture.day2BusinessDate} 写入单元`,
      state: prepareDone ? 'done' : 'failed',
      detail: prepareDone ? '单独验证通过' : '规则缺口',
    },
    {
      id: 'write',
      label: `写入 ${fixture.targetName}`,
      state: writeDone ? 'done' : 'pending',
      detail: writeDone ? `${day.rowsWritten} 行` : '未执行',
    },
  ]
}

export interface LifecycleTestMatrixRow {
  readonly state: string
  readonly covers: string
  readonly evidence: string
}

/** Step 7 的三状态最小矩阵：不承诺穷尽所有生产状态。 */
export function getLifecycleTestMatrix(
  fixture: AccountBalanceFixture = accountBalanceSnapshotFixture,
): readonly LifecycleTestMatrixRow[] {
  return [
    {
      state: 'object not exists',
      covers: 'initialize：创建目标对象，并初始化第一个日期写入单元',
      evidence: `Day 1 · ${fixture.day1BusinessDate}`,
    },
    {
      state: 'object already exists',
      covers: 'maintain：准备当前 business_date 的写入单元',
      evidence: `Day 2 · ${fixture.day2BusinessDate}`,
    },
    {
      state: 'rerun same business_date',
      covers: '同一业务日期重复执行：写入保持幂等，不产生重复快照',
      evidence: `Day 2 Rerun · ${fixture.day2BusinessDate}`,
    },
  ]
}
