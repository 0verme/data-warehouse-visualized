/**
 * 生产实践案例 13-2 · 交付链证据与判断纯函数。
 *
 * 状态推进顺序是固定的：
 *   Producer SUCCESS（数据文件 final） → 数据到达接收端 → 完成信号缺失
 *   → artifact validation → 幂等恢复完成信号 → Consumer 恰好消费一次
 *
 * 五状态分类、Step 3 排除、Step 4 定位、artifact validation、修复结果与
 * 5 项端到端验证都从这里的函数计算；组件只按 Step 的 reveal 语义展示。
 */

import type {
  AccountBalanceSnapshotRow,
  ArtifactValidation,
  ArtifactValidationCheck,
  CompletionSignalRestore,
  ConsumerBatchRecord,
  ConsumerEvaluation,
  ConsumerEvidence,
  DeliveryBatchKeyRow,
  DeliveryBoundaryState,
  DeliveryContractField,
  DeliveryConsumerObservation,
  DeliveryEliminationRow,
  DeliveryEvidenceRow,
  DeliveryFixture,
  DeliveryInvestigationState,
  DeliveryLocalization,
  DeliveryReveal,
  DeliveryStateInput,
  DeliveryStateLadderItem,
  DeliveryVerificationCheck,
  ExchangeState,
  ExchangedFile,
  ProducerArtifact,
} from './types'

export const accountBalanceDeliveryFixture: DeliveryFixture = {
  producerTask: 'build.account-balance-snapshot.daily',
  consumerTask: 'consume.account-balance-snapshot.daily',
  assetName: 'AccountBalanceSnapshot',
  grain: 'Account × snapshot_date',
  businessDate: '2026-09-30',
  batchId: '20260930',
  previousBusinessDate: '2026-09-29',
  previousBatchId: '20260929',
  accounts: [
    { accountId: 'A001', balance: 132400 },
    { accountId: 'A002', balance: 75800 },
    { accountId: 'A003', balance: 249300 },
    { accountId: 'A004', balance: 22800 },
    { accountId: 'A005', balance: 94100 },
    { accountId: 'A006', balance: 318600 },
  ],
}

export const DELIVERY_STATE_LABELS: Record<DeliveryBoundaryState, string> = {
  'not-produced': '未产出',
  'produced-incomplete': '已产出但未完成',
  'complete-not-transferred': '已完成但未传输',
  'delivered-not-recognized': '已传输但未被识别',
  'recognized-not-consumed': '已识别但未消费',
}

export const DELIVERY_STATE_EVIDENCE: Record<DeliveryBoundaryState, string> = {
  'not-produced': '没有数据文件',
  'produced-incomplete': '仍是临时文件 / 最终命名未完成 / 行数不足',
  'complete-not-transferred': '最终文件只在生产侧，接收端没有',
  'delivered-not-recognized': '接收端已有数据文件；同批次完成信号缺失 / 不匹配',
  'recognized-not-consumed': '触发条件满足但消费失败 / 滞后',
}

export function batchIdFromBusinessDate(businessDate: string): string {
  return businessDate.replaceAll('-', '')
}

export function deriveTempFileName(batchId: string): string {
  return `.account_balance_snapshot_${batchId}.txt.tmp`
}

export function deriveDataFileName(batchId: string): string {
  return `account_balance_snapshot_${batchId}.txt`
}

export function deriveCompletionSignalName(batchId: string): string {
  return `account_balance_snapshot_${batchId}.flag`
}

export function buildSnapshotRows(
  fixture: DeliveryFixture = accountBalanceDeliveryFixture,
): readonly AccountBalanceSnapshotRow[] {
  return fixture.accounts.map((account) => ({
    accountId: account.accountId,
    snapshotDate: fixture.businessDate,
    balance: account.balance,
  }))
}

/** Producer 产出数据 artifact：先临时文件，再完成最终命名。 */
export function createProducerArtifact(
  fixture: DeliveryFixture = accountBalanceDeliveryFixture,
): ProducerArtifact {
  return {
    tempFileName: deriveTempFileName(fixture.batchId),
    tempFilePresent: false,
    dataFileName: deriveDataFileName(fixture.batchId),
    renameCompleted: true,
    businessDate: fixture.businessDate,
    batchId: fixture.batchId,
    rowCount: fixture.accounts.length,
    rows: buildSnapshotRows(fixture),
  }
}

/** 接收端已经拿到本批次 final 文件；信号清单里只有上一批次的信号。 */
export function createInitialExchange(
  fixture: DeliveryFixture = accountBalanceDeliveryFixture,
): ExchangeState {
  return {
    dataFiles: [
      {
        name: deriveDataFileName(fixture.batchId),
        businessDate: fixture.businessDate,
        batchId: fixture.batchId,
        readable: true,
        rowCount: fixture.accounts.length,
      },
    ],
    signalFiles: [
      {
        name: deriveCompletionSignalName(fixture.previousBatchId),
        businessDate: fixture.previousBusinessDate,
        batchId: fixture.previousBatchId,
        readable: true,
        rowCount: null,
      },
    ],
  }
}

export function createConsumerEvidence(
  fixture: DeliveryFixture = accountBalanceDeliveryFixture,
): ConsumerEvidence {
  return {
    serviceStatus: 'running',
    triggerCondition: '同批次 completion signal 存在',
    records: [
      {
        batchId: fixture.previousBatchId,
        businessDate: fixture.previousBusinessDate,
        rowCount: fixture.accounts.length,
        outcome: 'success',
      },
    ],
  }
}

export function findDataFile(exchange: ExchangeState, batchId: string): ExchangedFile | undefined {
  return exchange.dataFiles.find((file) => file.batchId === batchId)
}

export function findSignal(exchange: ExchangeState, batchId: string): ExchangedFile | undefined {
  return exchange.signalFiles.find((file) => file.batchId === batchId)
}

export function getBatchRecords(
  consumer: ConsumerEvidence,
  batchId: string,
): readonly ConsumerBatchRecord[] {
  return consumer.records.filter((record) => record.batchId === batchId)
}

export function getBatchSuccessRecords(
  consumer: ConsumerEvidence,
  batchId: string,
): readonly ConsumerBatchRecord[] {
  return getBatchRecords(consumer, batchId).filter((record) => record.outcome === 'success')
}

export function getBatchFailureRecords(
  consumer: ConsumerEvidence,
  batchId: string,
): readonly ConsumerBatchRecord[] {
  return getBatchRecords(consumer, batchId).filter((record) => record.outcome === 'failed')
}

/**
 * 五状态分类的唯一入口。顺序即优先级：先看数据是否产出、是否完成，
 * 再看是否传输，最后才看同批次完成信号与消费执行。
 */
export function classifyDeliveryState(input: DeliveryStateInput): DeliveryBoundaryState | null {
  if (!input.producerFilePresent) {
    return 'not-produced'
  }

  if (
    input.tempFilePresent ||
    !input.renameCompleted ||
    input.producerRowCount !== input.expectedRowCount
  ) {
    return 'produced-incomplete'
  }

  if (!input.receiverFilePresent || !input.receiverFileReadable) {
    return 'complete-not-transferred'
  }

  if (!input.matchingSignalPresent) {
    return 'delivered-not-recognized'
  }

  if (input.consumerFailedAttempts > 0) {
    return 'recognized-not-consumed'
  }

  return null
}

export function toDeliveryStateInput(
  fixture: DeliveryFixture,
  producer: ProducerArtifact,
  exchange: ExchangeState,
  consumer: ConsumerEvidence,
): DeliveryStateInput {
  const receiverFile = findDataFile(exchange, fixture.batchId)
  const matchingSignal = findSignal(exchange, fixture.batchId)

  return {
    producerFilePresent: producer.dataFileName.length > 0,
    tempFilePresent: producer.tempFilePresent,
    renameCompleted: producer.renameCompleted,
    producerRowCount: producer.rowCount,
    expectedRowCount: fixture.accounts.length,
    receiverFilePresent: receiverFile !== undefined,
    receiverFileReadable: receiverFile?.readable ?? false,
    matchingSignalPresent: matchingSignal !== undefined,
    consumerFailedAttempts: getBatchFailureRecords(consumer, fixture.batchId).length,
  }
}

/**
 * Step 3 的排除清单。只消除「未产出 / 已产出但未完成 / 已完成但未传输」，
 * 剩余候选（识别 / 消费）留到 Step 4 对照批次键后再定位。
 */
export function getDeliveryEliminations(
  fixture: DeliveryFixture,
  producer: ProducerArtifact,
  exchange: ExchangeState,
): readonly DeliveryEliminationRow[] {
  const receiverFile = findDataFile(exchange, fixture.batchId)
  const finalName = producer.dataFileName === deriveDataFileName(fixture.batchId)
  const complete =
    !producer.tempFilePresent &&
    producer.renameCompleted &&
    finalName &&
    producer.rowCount === fixture.accounts.length

  return [
    {
      id: 'not-produced',
      label: DELIVERY_STATE_LABELS['not-produced'],
      eliminated: producer.dataFileName.length > 0,
      reason:
        producer.dataFileName.length > 0
          ? `已经观察到数据文件 ${producer.dataFileName}。`
          : '还没有观察到数据文件。',
    },
    {
      id: 'produced-incomplete',
      label: DELIVERY_STATE_LABELS['produced-incomplete'],
      eliminated: complete,
      reason: complete
        ? `临时文件已消失，最终命名完成，共 ${producer.rowCount} 行（与预期一致）。`
        : `最终命名未完成或行数为 ${producer.rowCount}（预期 ${fixture.accounts.length}）。`,
    },
    {
      id: 'complete-not-transferred',
      label: DELIVERY_STATE_LABELS['complete-not-transferred'],
      eliminated: receiverFile !== undefined && receiverFile.readable,
      reason:
        receiverFile !== undefined && receiverFile.readable
          ? `接收端已有同名 final 文件 ${receiverFile.name}，并且可读。`
          : '接收端还没有可读的本批次 final 文件。',
    },
  ]
}

export function getDeliveryStateLadder(
  localization: DeliveryLocalization | null,
): readonly DeliveryStateLadderItem[] {
  const order: readonly DeliveryBoundaryState[] = [
    'not-produced',
    'produced-incomplete',
    'complete-not-transferred',
    'delivered-not-recognized',
    'recognized-not-consumed',
  ]

  return order.map((id) => ({
    id,
    label: DELIVERY_STATE_LABELS[id],
    evidenceForm: DELIVERY_STATE_EVIDENCE[id],
    status: localization === null ? 'open' : localization.state === id ? 'current' : 'excluded',
  }))
}

const BOUNDARY_BY_STATE: Record<DeliveryBoundaryState, string> = {
  'not-produced': '数据生产边界：还没有产出数据文件。',
  'produced-incomplete': '数据完成边界：文件仍未完成最终命名，或行数与预期不符。',
  'complete-not-transferred': '传输边界：最终文件还没有到达接收端。',
  'delivered-not-recognized':
    '完成信号边界：数据已到达接收端，但同批次完成信号缺失 / 不可匹配，delivery contract 没有闭合。',
  'recognized-not-consumed': '消费执行边界：触发条件已满足，但 Consumer 执行失败或滞后。',
}

export function localizeDeliveryFailure(
  fixture: DeliveryFixture,
  producer: ProducerArtifact,
  exchange: ExchangeState,
  consumer: ConsumerEvidence,
): DeliveryLocalization | null {
  const state = classifyDeliveryState(toDeliveryStateInput(fixture, producer, exchange, consumer))

  if (state === null) {
    return null
  }

  const expectedSignalName = deriveCompletionSignalName(fixture.batchId)
  const receiverFile = findDataFile(exchange, fixture.batchId)
  const batchIdentityMatches =
    receiverFile !== undefined &&
    receiverFile.businessDate === fixture.businessDate &&
    receiverFile.batchId === fixture.batchId
  const excludedState = state === 'delivered-not-recognized' ? 'recognized-not-consumed' : null
  const attempts = getBatchRecords(consumer, fixture.batchId).length
  const failures = getBatchFailureRecords(consumer, fixture.batchId).length

  return {
    state,
    stateLabel: DELIVERY_STATE_LABELS[state],
    failureBoundary: BOUNDARY_BY_STATE[state],
    expectedSignalName,
    observedSignalNames: exchange.signalFiles.map((file) => file.name),
    observedSignalBatchIds: exchange.signalFiles.map((file) => file.batchId),
    excludedState,
    excludedReason:
      excludedState === null
        ? null
        : `本批次没有任何执行尝试或失败记录（本批次记录 ${attempts} 条，失败 ${failures} 条），因此「${
            DELIVERY_STATE_LABELS['recognized-not-consumed']
          }」不成立。`,
    batchIdentityMatches,
  }
}

/** Step 4 的批次键对照：期望值由 business_date + batch_id 推导，实际值来自接收端观察。 */
export function getBatchKeyComparison(
  fixture: DeliveryFixture,
  exchange: ExchangeState,
): readonly DeliveryBatchKeyRow[] {
  const receiverFile = findDataFile(exchange, fixture.batchId)
  const matchingSignal = findSignal(exchange, fixture.batchId)
  const expectedSignalName = deriveCompletionSignalName(fixture.batchId)
  const observedSignal =
    matchingSignal?.name ??
    (exchange.signalFiles.length > 0
      ? `缺失（接收端只有 ${exchange.signalFiles.map((file) => file.batchId).join('、')} 的信号）`
      : '缺失')

  return [
    {
      id: 'business_date',
      label: 'business_date',
      expected: fixture.businessDate,
      observed: receiverFile?.businessDate ?? '—',
      matches: receiverFile?.businessDate === fixture.businessDate,
    },
    {
      id: 'batch_id',
      label: 'batch_id',
      expected: fixture.batchId,
      observed: receiverFile?.batchId ?? '—',
      matches: receiverFile?.batchId === fixture.batchId,
    },
    {
      id: 'data_file',
      label: 'data_file',
      expected: deriveDataFileName(fixture.batchId),
      observed: receiverFile?.name ?? '—',
      matches: receiverFile?.name === deriveDataFileName(fixture.batchId),
    },
    {
      id: 'completion_signal',
      label: 'completion_signal',
      expected: expectedSignalName,
      observed: observedSignal,
      matches: matchingSignal !== undefined && matchingSignal.name === expectedSignalName,
    },
  ]
}

/** 修复前的安全前提：artifact 必须是 final、接收端可读、批次 identity 匹配、行数有效。 */
export function validateDeliveryArtifact(
  fixture: DeliveryFixture,
  producer: ProducerArtifact,
  exchange: ExchangeState,
): ArtifactValidation {
  const expectedDataFileName = deriveDataFileName(fixture.batchId)
  const receiverFile = findDataFile(exchange, fixture.batchId)

  const finalNamed =
    !producer.tempFilePresent &&
    producer.renameCompleted &&
    producer.dataFileName === expectedDataFileName
  const readable =
    receiverFile !== undefined &&
    receiverFile.readable &&
    receiverFile.name === expectedDataFileName
  const identity =
    producer.businessDate === fixture.businessDate &&
    producer.batchId === fixture.batchId &&
    receiverFile?.businessDate === fixture.businessDate &&
    receiverFile?.batchId === fixture.batchId
  const rowCountValid =
    producer.rowCount === fixture.accounts.length &&
    receiverFile !== undefined &&
    receiverFile.rowCount === producer.rowCount

  const checks: readonly ArtifactValidationCheck[] = [
    {
      id: 'artifact-final',
      label: '数据文件已完成最终命名',
      detail: finalNamed
        ? `${producer.dataFileName} · 临时文件已清理`
        : `${producer.dataFileName || '（无文件）'} · 最终命名未完成或临时文件仍存在`,
      passed: finalNamed,
    },
    {
      id: 'receiver-readable',
      label: '接收端可读',
      detail: readable
        ? `${expectedDataFileName} 已在接收端，可读`
        : '接收端没有可读的同名 final 文件',
      passed: readable,
    },
    {
      id: 'batch-identity',
      label: 'business_date + batch_id 匹配',
      detail: identity
        ? `${fixture.businessDate} + ${fixture.batchId} 与接收端文件一致`
        : `生产侧 / 接收端的 batch identity 与 ${fixture.businessDate} + ${fixture.batchId} 不一致`,
      passed: identity,
    },
    {
      id: 'row-count-valid',
      label: '行数有效',
      detail:
        receiverFile === undefined
          ? `生产侧 ${producer.rowCount} 行（预期 ${fixture.accounts.length}），接收端无文件`
          : `生产侧 ${producer.rowCount} 行 · 接收端 ${receiverFile.rowCount ?? '—'} 行 · 预期 ${
              fixture.accounts.length
            } 行`,
      passed: rowCountValid,
    },
  ]

  return { checks, passed: checks.every((check) => check.passed) }
}

export const REPAIR_BLAST_RADIUS_NOTE =
  '本次只恢复 completion signal，不重跑上游 DAG；这是 artifact 已确认正确时的最小 blast-radius 决策，不是通用规则。'

/**
 * 幂等恢复完成信号。只有 artifact validation 通过时才允许恢复；
 * 已存在同批次信号时保持原样，不重复添加。
 */
export function restoreCompletionSignal(
  fixture: DeliveryFixture,
  exchange: ExchangeState,
  validation: ArtifactValidation,
): CompletionSignalRestore {
  const expectedSignalName = deriveCompletionSignalName(fixture.batchId)

  if (!validation.passed) {
    const failed = validation.checks.filter((check) => !check.passed).length
    return {
      expectedSignalName,
      restored: false,
      alreadyPresent: false,
      blockedReason: `artifact validation 有 ${failed} 项未通过；先修复数据，再声明完成。`,
      exchange,
      blastRadiusNote: REPAIR_BLAST_RADIUS_NOTE,
    }
  }

  if (findSignal(exchange, fixture.batchId) !== undefined) {
    return {
      expectedSignalName,
      restored: true,
      alreadyPresent: true,
      blockedReason: null,
      exchange,
      blastRadiusNote: REPAIR_BLAST_RADIUS_NOTE,
    }
  }

  const signal: ExchangedFile = {
    name: expectedSignalName,
    businessDate: fixture.businessDate,
    batchId: fixture.batchId,
    readable: true,
    rowCount: null,
  }

  return {
    expectedSignalName,
    restored: true,
    alreadyPresent: false,
    blockedReason: null,
    exchange: { ...exchange, signalFiles: [...exchange.signalFiles, signal] },
    blastRadiusNote: REPAIR_BLAST_RADIUS_NOTE,
  }
}

/**
 * Consumer 评估：只有同批次完成信号存在且本批次还没有成功消费记录时，
 * 才会新增一条消费记录；重复评估不会重复消费。
 */
export function evaluateConsumer(
  fixture: DeliveryFixture,
  consumer: ConsumerEvidence,
  exchange: ExchangeState,
): ConsumerEvaluation {
  const signal = findSignal(exchange, fixture.batchId)

  if (signal === undefined) {
    return {
      consumer,
      consumed: false,
      consumedRowCount: null,
      reason: `同批次完成信号 ${deriveCompletionSignalName(fixture.batchId)} 不存在，触发条件不满足。`,
    }
  }

  const existing = getBatchSuccessRecords(consumer, fixture.batchId)

  if (existing.length > 0) {
    return {
      consumer,
      consumed: false,
      consumedRowCount: null,
      reason: `本批次已经有 ${existing.length} 条成功消费记录，不再重复消费。`,
    }
  }

  const dataFile = findDataFile(exchange, fixture.batchId)
  const rowCount = dataFile?.rowCount ?? 0

  return {
    consumer: {
      ...consumer,
      records: [
        ...consumer.records,
        {
          batchId: fixture.batchId,
          businessDate: fixture.businessDate,
          rowCount,
          outcome: 'success',
        },
      ],
    },
    consumed: true,
    consumedRowCount: rowCount,
    reason: `按同批次完成信号触发，消费 ${rowCount} 行并记录一次成功消费。`,
  }
}

/** Step 6 的 5 项端到端验证。每一项都从当前状态计算，并支持负向 mutation。 */
export function verifyDelivery(
  fixture: DeliveryFixture,
  producer: ProducerArtifact,
  exchange: ExchangeState,
  consumer: ConsumerEvidence,
  validation: ArtifactValidation,
  baseline: ConsumerEvidence,
): readonly DeliveryVerificationCheck[] {
  const expectedDataFileName = deriveDataFileName(fixture.batchId)
  const expectedSignalName = deriveCompletionSignalName(fixture.batchId)
  const receiverFile = findDataFile(exchange, fixture.batchId)
  const signal = findSignal(exchange, fixture.batchId)
  const successRecords = getBatchSuccessRecords(consumer, fixture.batchId)
  const failureRecords = getBatchFailureRecords(consumer, fixture.batchId)
  const consumedRowCount = successRecords[0]?.rowCount ?? null

  const artifactPassed = validation.passed && receiverFile?.name === expectedDataFileName
  const signalContinuous =
    signal !== undefined &&
    signal.name === expectedSignalName &&
    signal.batchId === fixture.batchId &&
    signal.businessDate === fixture.businessDate
  const exactlyOnce = successRecords.length === 1 && failureRecords.length === 0

  const baselineSuccess = new Map<string, number>()
  for (const record of baseline.records) {
    if (record.outcome !== 'success') continue
    baselineSuccess.set(record.batchId, (baselineSuccess.get(record.batchId) ?? 0) + 1)
  }
  const historicalPreserved = [...baselineSuccess.entries()].every(
    ([batchId, count]) => getBatchSuccessRecords(consumer, batchId).length === count,
  )
  const noLaterBatch = consumer.records.every((record) => record.batchId <= fixture.batchId)
  const noOtherSideEffects = historicalPreserved && noLaterBatch

  const rowCountMatches =
    consumedRowCount !== null &&
    consumedRowCount === producer.rowCount &&
    receiverFile?.rowCount === producer.rowCount

  const latestBatchId =
    consumer.records.length === 0
      ? '—'
      : consumer.records
          .map((record) => record.batchId)
          .sort((left, right) => left.localeCompare(right))
          .at(-1)!

  return [
    {
      id: 'artifact-intact-and-readable',
      label: 'artifact 完整且接收端可读',
      detail: artifactPassed
        ? `${expectedDataFileName} · 接收端可读 · ${producer.rowCount} 行`
        : validation.passed
          ? '接收端文件与验证过的 artifact 不一致'
          : `artifact validation 有 ${
              validation.checks.filter((check) => !check.passed).length
            } 项未通过`,
      passed: artifactPassed,
    },
    {
      id: 'signal-identity-continuity',
      label: 'completion signal identity 与 business_date + batch_id 连续',
      detail:
        signal === undefined
          ? `期望 ${expectedSignalName}，当前缺失`
          : `${signal.name} · business_date=${signal.businessDate} · batch_id=${signal.batchId}`,
      passed: signalContinuous,
    },
    {
      id: 'consumer-exactly-once',
      label: 'Consumer 恰好消费一次',
      detail: `本批次成功消费 ${successRecords.length} 条记录 · 失败 ${failureRecords.length} 条`,
      passed: exactlyOnce,
    },
    {
      id: 'no-other-batch-side-effects',
      label: '没有其他批次副作用',
      detail: historicalPreserved
        ? `历史 ${baseline.records.length} 条消费记录保持不变 · 最新批次 ${latestBatchId} 不超过 ${fixture.batchId}`
        : '历史批次的消费记录发生变化',
      passed: noOtherSideEffects,
    },
    {
      id: 'row-count-matches-artifact',
      label: 'Consumer 读取行数与已验证 artifact 一致',
      detail:
        consumedRowCount === null
          ? '本批次还没有消费行数'
          : `消费 ${consumedRowCount} 行 = 已验证 artifact ${producer.rowCount} 行`,
      passed: rowCountMatches,
    },
  ]
}

export function getConsumerEvidenceValue(
  fixture: DeliveryFixture,
  consumer: ConsumerEvidence,
  exchange: ExchangeState,
): string {
  const success = getBatchSuccessRecords(consumer, fixture.batchId)

  if (success.length > 0) {
    return `已消费 ${success[0]!.rowCount} 行 · 恰好一次`
  }

  if (findSignal(exchange, fixture.batchId) !== undefined) {
    return 'running · 已识别本批次 · 等待消费'
  }

  return `running · 上一批次 ${fixture.previousBatchId} 已消费 · 本批次无执行尝试`
}

/** Evidence Panel：未 reveal 的字段完全不渲染，避免 Step 1–2 泄露字段名。 */
export function getDeliveryEvidenceRows(
  state: DeliveryInvestigationState,
  reveal: DeliveryReveal,
  fixture: DeliveryFixture = accountBalanceDeliveryFixture,
): readonly DeliveryEvidenceRow[] {
  const rows: DeliveryEvidenceRow[] = [
    { field: 'Producer Job', value: 'SUCCESS', state: 'success' },
    {
      field: 'business_date',
      value: reveal.businessDate ? fixture.businessDate : '—',
      state: reveal.businessDate ? 'accent' : 'muted',
    },
  ]

  if (reveal.batchId) {
    rows.push({ field: 'batch_id', value: fixture.batchId, state: 'accent' })
  }

  if (reveal.producerArtifact) {
    const final = state.producer.renameCompleted && !state.producer.tempFilePresent
    rows.push({
      field: 'Data File',
      value: `${state.producer.dataFileName} · ${final ? 'final' : '未完成'}`,
      state: final ? 'success' : 'danger',
    })
    rows.push({
      field: 'Row Count',
      value: `${state.producer.rowCount} 行 · ${
        state.producer.rowCount === fixture.accounts.length ? '符合预期' : '与预期不一致'
      }`,
      state: state.producer.rowCount === fixture.accounts.length ? 'success' : 'danger',
    })
  }

  if (reveal.completionObservation) {
    const signal = findSignal(state.exchange, fixture.batchId)
    rows.push({
      field: 'Completion Signal',
      value:
        signal === undefined
          ? `${deriveCompletionSignalName(fixture.batchId)} · 缺失 / 不可匹配`
          : `${signal.name} · 已恢复`,
      state: signal === undefined ? 'danger' : 'success',
    })
  }

  if (reveal.receiverObservation) {
    const dataFile = findDataFile(state.exchange, fixture.batchId)
    rows.push({
      field: 'Receiver',
      value:
        dataFile === undefined
          ? '本批次 final 文件未到达'
          : `${dataFile.name} 已到达 · ${dataFile.readable ? '可读' : '不可读'}`,
      state: dataFile?.readable ? 'success' : 'danger',
    })
  }

  rows.push(
    reveal.consumerEvidence
      ? {
          field: 'Consumer',
          value: getConsumerEvidenceValue(fixture, state.consumer, state.exchange),
          state:
            getBatchSuccessRecords(state.consumer, fixture.batchId).length > 0
              ? 'success'
              : 'warning',
        }
      : { field: 'Consumer', value: '无数据（等待中）', state: 'warning' },
  )

  return rows
}

/** Step 3 的 Consumer 观察证据：没有报错不等于健康，只陈述确定性事实。 */
export function getConsumerObservations(
  fixture: DeliveryFixture,
  consumer: ConsumerEvidence,
  exchange: ExchangeState,
): readonly DeliveryConsumerObservation[] {
  const previousSuccess = getBatchSuccessRecords(consumer, fixture.previousBatchId)
  const attempts = getBatchRecords(consumer, fixture.batchId)
  const failures = getBatchFailureRecords(consumer, fixture.batchId)
  const signal = findSignal(exchange, fixture.batchId)

  return [
    {
      label: 'Consumer 进程',
      value: consumer.serviceStatus === 'running' ? '运行中' : '未运行',
      detail:
        consumer.serviceStatus === 'running'
          ? '实例状态为 running，存在可查询的消费记录。'
          : '实例当前未运行。',
    },
    {
      label: `上一批次 ${fixture.previousBatchId}`,
      value: previousSuccess.length > 0 ? '已消费成功' : '没有成功记录',
      detail:
        previousSuccess.length > 0
          ? `${fixture.previousBusinessDate} · ${previousSuccess[0]!.rowCount} 行 · 记录完整`
          : '没有找到上一批次的成功消费记录。',
    },
    {
      label: `本批次 ${fixture.batchId}`,
      value: attempts.length === 0 ? '没有执行尝试' : `${attempts.length} 次尝试`,
      detail:
        attempts.length === 0
          ? '消费记录中没有该批次的成功或失败记录。'
          : `成功 ${attempts.length - failures.length} 条 · 失败 ${failures.length} 条`,
    },
    {
      label: '触发条件',
      value: consumer.triggerCondition,
      detail: signal === undefined ? '当前不满足' : '当前已满足',
    },
  ]
}

export function getDeliveryContractFields(): readonly DeliveryContractField[] {
  return [
    {
      id: 'business_date',
      name: 'business_date',
      meaning: '这批数据属于哪个业务日期',
    },
    {
      id: 'batch_id',
      name: 'batch_id',
      meaning: '本批次的唯一 identity，可由 business_date 推导',
    },
    {
      id: 'data_file',
      name: 'data_file',
      meaning: '承载本批次数据的文件名',
    },
    {
      id: 'completion_signal',
      name: 'completion_signal',
      meaning: '声明本批次已完成交付的信号（本案例由 .flag 承载）',
    },
    {
      id: 'row_count_or_size',
      name: 'row_count_or_size',
      meaning: '接收端用来验证数据量的行数或大小',
    },
  ]
}
