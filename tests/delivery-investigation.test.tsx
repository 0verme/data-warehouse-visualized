import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DeliveryInvestigationLab } from '../src/components/visualizations/DeliveryInvestigationLab'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug, lessons } from '../src/data/course'
import {
  DELIVERY_STATE_LABELS,
  accountBalanceDeliveryFixture as fixture,
  batchIdFromBusinessDate,
  buildSnapshotRows,
  classifyDeliveryState,
  createConsumerEvidence,
  createInitialExchange,
  createProducerArtifact,
  deriveCompletionSignalName,
  deriveDataFileName,
  deriveTempFileName,
  evaluateConsumer,
  findDataFile,
  findSignal,
  getBatchKeyComparison,
  getConsumerObservations,
  getDeliveryContractFields,
  getDeliveryEliminations,
  getDeliveryEvidenceRows,
  getDeliveryStateLadder,
  localizeDeliveryFailure,
  restoreCompletionSignal,
  validateDeliveryArtifact,
  verifyDelivery,
} from '../src/features/delivery-investigation/model'
import {
  buildDeliveryInvestigationSteps,
  createDeliveryInvestigationKernel,
} from '../src/features/delivery-investigation/steps'
import type {
  DeliveryStateInput,
  DeliveryVerificationCheck,
} from '../src/features/delivery-investigation/types'
import { getAdjacentLessons } from '../src/utils/lesson'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
  isVisualizationPlayerAtEnd,
  isVisualizationPlayerAtStart,
} from '../src/utils/visualization-steps'

function initialRun() {
  const producer = createProducerArtifact(fixture)
  const exchange = createInitialExchange(fixture)
  const consumer = createConsumerEvidence(fixture)
  const validation = validateDeliveryArtifact(fixture, producer, exchange)
  const repair = restoreCompletionSignal(fixture, exchange, validation)
  const consumption = evaluateConsumer(fixture, consumer, repair.exchange)
  const verification = verifyDelivery(
    fixture,
    producer,
    repair.exchange,
    consumption.consumer,
    validation,
    consumer,
  )

  return { producer, exchange, consumer, validation, repair, consumption, verification }
}

function checkById(checks: readonly DeliveryVerificationCheck[], id: string) {
  const check = checks.find((item) => item.id === id)
  expect(check, `缺少验证项 ${id}`).toBeDefined()
  return check!
}

function stateInput(overrides: Partial<DeliveryStateInput> = {}): DeliveryStateInput {
  return {
    producerFilePresent: true,
    tempFilePresent: false,
    renameCompleted: true,
    producerRowCount: 6,
    expectedRowCount: 6,
    receiverFilePresent: true,
    receiverFileReadable: true,
    matchingSignalPresent: false,
    consumerFailedAttempts: 0,
    ...overrides,
  }
}

describe('生产案例 13-2 · fixture 一致性', () => {
  it('batch identity 与业务日期一一对应，文件名 / 信号名都由 batch 推导', () => {
    expect(fixture.businessDate).toBe('2026-09-30')
    expect(fixture.batchId).toBe('20260930')
    expect(batchIdFromBusinessDate(fixture.businessDate)).toBe(fixture.batchId)
    expect(batchIdFromBusinessDate(fixture.previousBusinessDate)).toBe(fixture.previousBatchId)

    expect(deriveDataFileName(fixture.batchId)).toBe('account_balance_snapshot_20260930.txt')
    expect(deriveTempFileName(fixture.batchId)).toBe('.account_balance_snapshot_20260930.txt.tmp')
    expect(deriveCompletionSignalName(fixture.batchId)).toBe(
      'account_balance_snapshot_20260930.flag',
    )
    expect(fixture.grain).toBe('Account × snapshot_date')
  })

  it('Producer 产出 final 文件、正确 business_date 与合理行数', () => {
    const producer = createProducerArtifact(fixture)

    expect(producer.tempFilePresent).toBe(false)
    expect(producer.renameCompleted).toBe(true)
    expect(producer.dataFileName).toBe(deriveDataFileName(fixture.batchId))
    expect(producer.businessDate).toBe(fixture.businessDate)
    expect(producer.batchId).toBe(fixture.batchId)
    expect(producer.rowCount).toBe(fixture.accounts.length)
    expect(producer.rows).toEqual(buildSnapshotRows(fixture))
    expect(producer.rows.every((row) => row.snapshotDate === fixture.businessDate)).toBe(true)
  })

  it('接收端已有 final 数据文件；信号清单只有上一批次', () => {
    const exchange = createInitialExchange(fixture)
    const dataFile = findDataFile(exchange, fixture.batchId)

    expect(dataFile).toMatchObject({
      name: deriveDataFileName(fixture.batchId),
      businessDate: fixture.businessDate,
      batchId: fixture.batchId,
      readable: true,
      rowCount: fixture.accounts.length,
    })
    expect(exchange.signalFiles.map((file) => file.batchId)).toEqual([fixture.previousBatchId])
    expect(findSignal(exchange, fixture.batchId)).toBeUndefined()
  })

  it('Consumer 证据是确定性的：running / 上一批次已消费 / 本批次无执行尝试', () => {
    const consumer = createConsumerEvidence(fixture)

    expect(consumer.serviceStatus).toBe('running')
    expect(consumer.triggerCondition).toBe('同批次 completion signal 存在')
    expect(consumer.records).toHaveLength(1)
    expect(consumer.records[0]).toMatchObject({
      batchId: fixture.previousBatchId,
      businessDate: fixture.previousBusinessDate,
      rowCount: fixture.accounts.length,
      outcome: 'success',
    })
    expect(consumer.records.some((record) => record.batchId === fixture.batchId)).toBe(false)
  })

  it('交付 metadata 不进入业务 Grain：业务行只有 account × snapshot_date', () => {
    const rows = buildSnapshotRows(fixture)
    const keys = rows.map((row) => Object.keys(row).sort().join(','))

    expect(new Set(keys)).toEqual(new Set(['accountId,balance,snapshotDate']))
    expect(rows.map((row) => `${row.accountId}|${row.snapshotDate}`)).toHaveLength(
      fixture.accounts.length,
    )
  })
})

describe('生产案例 13-2 · 五状态分类', () => {
  it('未产出：没有数据文件', () => {
    expect(classifyDeliveryState(stateInput({ producerFilePresent: false }))).toBe('not-produced')
  })

  it('已产出但未完成：临时文件仍在 / rename 未完成 / 行数不足', () => {
    expect(classifyDeliveryState(stateInput({ tempFilePresent: true }))).toBe('produced-incomplete')
    expect(classifyDeliveryState(stateInput({ renameCompleted: false }))).toBe(
      'produced-incomplete',
    )
    expect(classifyDeliveryState(stateInput({ producerRowCount: 5 }))).toBe('produced-incomplete')
  })

  it('已完成但未传输：接收端没有可读文件', () => {
    expect(classifyDeliveryState(stateInput({ receiverFilePresent: false }))).toBe(
      'complete-not-transferred',
    )
    expect(classifyDeliveryState(stateInput({ receiverFileReadable: false }))).toBe(
      'complete-not-transferred',
    )
  })

  it('已传输但未被识别：文件已到达，但同批次完成信号缺失', () => {
    expect(classifyDeliveryState(stateInput({ matchingSignalPresent: false }))).toBe(
      'delivered-not-recognized',
    )
  })

  it('已识别但未消费：触发条件满足但存在失败尝试', () => {
    expect(
      classifyDeliveryState(stateInput({ matchingSignalPresent: true, consumerFailedAttempts: 1 })),
    ).toBe('recognized-not-consumed')
  })

  it('信号存在且没有失败尝试时不产生失败状态', () => {
    expect(classifyDeliveryState(stateInput({ matchingSignalPresent: true }))).toBeNull()
  })

  it('本案例 fixture 唯一落到「已传输但未被识别」', () => {
    const { producer, exchange, consumer } = initialRun()
    const localization = localizeDeliveryFailure(fixture, producer, exchange, consumer)

    expect(localization?.state).toBe('delivered-not-recognized')
    expect(localization?.stateLabel).toBe(DELIVERY_STATE_LABELS['delivered-not-recognized'])
  })
})

describe('生产案例 13-2 · failure localization 与 Evidence Gating', () => {
  it('Step 3 之前没有 localization；Step 3 只做排除，不命名最终状态', () => {
    const steps = buildDeliveryInvestigationSteps()

    expect(steps[0]!.state.localization).toBeNull()
    expect(steps[1]!.state.localization).toBeNull()
    expect(steps[2]!.state.localization).toBeNull()
    expect(steps[2]!.highlight?.reveal.stateLadder).toBe(false)

    const eliminations = getDeliveryEliminations(
      fixture,
      steps[2]!.state.producer,
      steps[2]!.state.exchange,
    )
    expect(eliminations.map((row) => row.id)).toEqual([
      'not-produced',
      'produced-incomplete',
      'complete-not-transferred',
    ])
    expect(eliminations.every((row) => row.eliminated)).toBe(true)
  })

  it('Step 4 才命名 failure boundary 并排除「已识别但未消费」', () => {
    const steps = buildDeliveryInvestigationSteps()
    const step4 = steps[3]!

    expect(step4.state.localization?.state).toBe('delivered-not-recognized')
    expect(step4.highlight?.reveal.stateLadder).toBe(true)
    expect(step4.state.localization?.excludedState).toBe('recognized-not-consumed')
    expect(step4.state.localization?.batchIdentityMatches).toBe(true)
    expect(step4.state.localization?.failureBoundary).toContain('完成信号')

    const ladder = getDeliveryStateLadder(step4.state.localization)
    expect(ladder).toHaveLength(5)
    expect(ladder.filter((item) => item.status === 'current').map((item) => item.id)).toEqual([
      'delivered-not-recognized',
    ])
    expect(ladder.filter((item) => item.status === 'excluded')).toHaveLength(4)

    const keys = getBatchKeyComparison(fixture, step4.state.exchange)
    expect(keys.map((row) => [row.id, row.matches])).toEqual([
      ['business_date', true],
      ['batch_id', true],
      ['data_file', true],
      ['completion_signal', false],
    ])
  })

  it('五状态阶梯在 localization 之前全部保持 open', () => {
    expect(getDeliveryStateLadder(null).every((item) => item.status === 'open')).toBe(true)
  })

  it('Consumer 证据支持「当前证据不支持执行失败」，而不是「健康」', () => {
    const { exchange, consumer } = initialRun()
    const observations = getConsumerObservations(fixture, consumer, exchange)

    expect(observations[0]).toMatchObject({ label: 'Consumer 进程', value: '运行中' })
    expect(observations[1]).toMatchObject({
      label: `上一批次 ${fixture.previousBatchId}`,
      value: '已消费成功',
    })
    expect(observations[2]).toMatchObject({
      label: `本批次 ${fixture.batchId}`,
      value: '没有执行尝试',
    })
    expect(observations[3]?.detail).toBe('当前不满足')
  })
})

describe('生产案例 13-2 · 修复安全前提与幂等', () => {
  it('fixture 的 artifact validation 四项全部通过', () => {
    const { validation } = initialRun()

    expect(validation.checks.map((check) => check.id)).toEqual([
      'artifact-final',
      'receiver-readable',
      'batch-identity',
      'row-count-valid',
    ])
    expect(validation.checks.every((check) => check.passed)).toBe(true)
    expect(validation.passed).toBe(true)
  })

  it('只有 validation 通过时才恢复 completion signal', () => {
    const producer = createProducerArtifact(fixture)
    const exchange = createInitialExchange(fixture)
    const validation = validateDeliveryArtifact(fixture, producer, exchange)
    const repair = restoreCompletionSignal(fixture, exchange, validation)

    expect(repair.restored).toBe(true)
    expect(repair.blockedReason).toBeNull()
    expect(findSignal(repair.exchange, fixture.batchId)?.name).toBe(
      deriveCompletionSignalName(fixture.batchId),
    )
    expect(repair.blastRadiusNote).toContain('不是通用规则')
  })

  it('artifact 不可读时拒绝恢复信号，并保持原状态', () => {
    const producer = createProducerArtifact(fixture)
    const broken = {
      ...createInitialExchange(fixture),
      dataFiles: createInitialExchange(fixture).dataFiles.map((file) => ({
        ...file,
        readable: false,
      })),
    }
    const validation = validateDeliveryArtifact(fixture, producer, broken)
    const repair = restoreCompletionSignal(fixture, broken, validation)

    expect(validation.passed).toBe(false)
    expect(repair.restored).toBe(false)
    expect(repair.blockedReason).toContain('先修复数据')
    expect(repair.exchange).toBe(broken)
    expect(findSignal(repair.exchange, fixture.batchId)).toBeUndefined()
  })

  it('batch mismatch 时 validation 失败且不允许补信号', () => {
    const producer = createProducerArtifact(fixture)
    const exchange = createInitialExchange(fixture)
    const wrongBatchProducer = { ...producer, batchId: fixture.previousBatchId }
    const validation = validateDeliveryArtifact(fixture, wrongBatchProducer, exchange)
    const repair = restoreCompletionSignal(fixture, exchange, validation)

    expect(validation.passed).toBe(false)
    expect(validation.checks.find((check) => check.id === 'batch-identity')?.passed).toBe(false)
    expect(repair.restored).toBe(false)
  })

  it('恢复信号是幂等的：重复执行不会产生第二条信号', () => {
    const { exchange, validation } = initialRun()
    const first = restoreCompletionSignal(fixture, exchange, validation)
    const second = restoreCompletionSignal(fixture, first.exchange, validation)

    expect(first.restored).toBe(true)
    expect(second.restored).toBe(true)
    expect(second.alreadyPresent).toBe(true)
    expect(second.exchange.signalFiles).toHaveLength(first.exchange.signalFiles.length)
    expect(
      second.exchange.signalFiles.filter((file) => file.batchId === fixture.batchId),
    ).toHaveLength(1)
  })

  it('Consumer 只在同批次完成信号存在时消费，且恰好一次', () => {
    const { consumer, exchange, repair } = initialRun()
    const blocked = evaluateConsumer(fixture, consumer, exchange)

    expect(blocked.consumed).toBe(false)
    expect(blocked.reason).toContain('触发条件不满足')

    const first = evaluateConsumer(fixture, consumer, repair.exchange)
    expect(first.consumed).toBe(true)
    expect(first.consumedRowCount).toBe(fixture.accounts.length)

    const second = evaluateConsumer(fixture, first.consumer, repair.exchange)
    expect(second.consumed).toBe(false)
    expect(second.consumer.records).toHaveLength(first.consumer.records.length)
  })
})

describe('生产案例 13-2 · 5 项端到端验证', () => {
  it('修复并消费后 5 项验证全部由状态计算通过', () => {
    const { producer, repair, consumption, validation, consumer, verification } = initialRun()

    expect(verification).toHaveLength(5)
    expect(verification.map((check) => check.id)).toEqual([
      'artifact-intact-and-readable',
      'signal-identity-continuity',
      'consumer-exactly-once',
      'no-other-batch-side-effects',
      'row-count-matches-artifact',
    ])
    expect(verification.every((check) => check.passed)).toBe(true)

    const recomputed = verifyDelivery(
      fixture,
      producer,
      repair.exchange,
      consumption.consumer,
      validation,
      consumer,
    )
    expect(recomputed).toEqual(verification)
  })

  it('负向 mutation：batch mismatch 使 artifact 验证项失败', () => {
    const { producer, repair, consumption, exchange, consumer } = initialRun()
    const wrongBatchProducer = { ...producer, batchId: fixture.previousBatchId }
    const validation = validateDeliveryArtifact(fixture, wrongBatchProducer, exchange)
    const verification = verifyDelivery(
      fixture,
      wrongBatchProducer,
      repair.exchange,
      consumption.consumer,
      validation,
      consumer,
    )

    expect(checkById(verification, 'artifact-intact-and-readable').passed).toBe(false)
    expect(checkById(verification, 'signal-identity-continuity').passed).toBe(true)
  })

  it('负向 mutation：signal identity 错误使连续性验证失败', () => {
    const { producer, repair, consumption, validation, consumer } = initialRun()
    const wrongSignalExchange = {
      ...repair.exchange,
      signalFiles: repair.exchange.signalFiles.map((file) =>
        file.batchId === fixture.batchId
          ? { ...file, name: 'account_balance_snapshot_20260930.done' }
          : file,
      ),
    }
    const verification = verifyDelivery(
      fixture,
      producer,
      wrongSignalExchange,
      consumption.consumer,
      validation,
      consumer,
    )

    expect(checkById(verification, 'signal-identity-continuity').passed).toBe(false)
    expect(checkById(verification, 'artifact-intact-and-readable').passed).toBe(true)
  })

  it('负向 mutation：重复消费使「恰好一次」验证失败', () => {
    const { producer, repair, consumption, validation, consumer } = initialRun()
    const duplicated = {
      ...consumption.consumer,
      records: [
        ...consumption.consumer.records,
        {
          batchId: fixture.batchId,
          businessDate: fixture.businessDate,
          rowCount: fixture.accounts.length,
          outcome: 'success' as const,
        },
      ],
    }
    const verification = verifyDelivery(
      fixture,
      producer,
      repair.exchange,
      duplicated,
      validation,
      consumer,
    )

    expect(checkById(verification, 'consumer-exactly-once').passed).toBe(false)
  })

  it('负向 mutation：消费行数与 artifact 不一致使行数验证失败', () => {
    const { producer, repair, consumption, validation, consumer } = initialRun()
    const lowRowConsumer = {
      ...consumption.consumer,
      records: consumption.consumer.records.map((record) =>
        record.batchId === fixture.batchId ? { ...record, rowCount: 5 } : record,
      ),
    }
    const verification = verifyDelivery(
      fixture,
      producer,
      repair.exchange,
      lowRowConsumer,
      validation,
      consumer,
    )

    expect(checkById(verification, 'row-count-matches-artifact').passed).toBe(false)
    expect(checkById(verification, 'consumer-exactly-once').passed).toBe(true)
  })

  it('负向 mutation：artifact 不可读使完整性验证失败', () => {
    const { producer, repair, consumption, consumer } = initialRun()
    const unreadableExchange = {
      ...repair.exchange,
      dataFiles: repair.exchange.dataFiles.map((file) =>
        file.batchId === fixture.batchId ? { ...file, readable: false } : file,
      ),
    }
    const validation = validateDeliveryArtifact(fixture, producer, unreadableExchange)
    const verification = verifyDelivery(
      fixture,
      producer,
      unreadableExchange,
      consumption.consumer,
      validation,
      consumer,
    )

    expect(validation.passed).toBe(false)
    expect(checkById(verification, 'artifact-intact-and-readable').passed).toBe(false)
  })
})

describe('生产案例 13-2 · Step Kernel 与 SSR 首屏', () => {
  it('kernel 保持 7 步，player 边界与现有 Headless Player 一致', () => {
    const kernel = createDeliveryInvestigationKernel()
    let player = createVisualizationPlayer(kernel.size)

    expect(kernel.size).toBe(7)
    expect(kernel.get(99).id).toBe('delivery-contract')
    expect(isVisualizationPlayerAtStart(player)).toBe(true)

    player = applyVisualizationPlayerAction(player, 'prev')
    expect(player.currentIndex).toBe(0)

    for (let index = 0; index < kernel.size; index += 1) {
      player = applyVisualizationPlayerAction(player, 'next')
    }

    expect(isVisualizationPlayerAtEnd(player)).toBe(true)
    expect(getCurrentVisualizationStep(player, kernel).id).toBe('delivery-contract')
    expect(applyVisualizationPlayerAction(player, 'next')).toBe(player)

    player = applyVisualizationPlayerAction(player, 'reset')
    expect(getCurrentVisualizationStep(player, kernel).id).toBe('symptom')
  })

  it('7 步顺序固定、确定性可重复', () => {
    const steps = buildDeliveryInvestigationSteps()

    expect(steps.map((step) => step.id)).toEqual([
      'symptom',
      'producer-evidence',
      'chain-observations',
      'completion-signal-localization',
      'artifact-first-repair',
      'end-to-end-verification',
      'delivery-contract',
    ])
    expect(steps.map((step) => step.highlight?.kind)).toEqual([
      'symptom',
      'producer-evidence',
      'observation',
      'localization',
      'repair',
      'verification',
      'prevention',
    ])
    expect(steps).toEqual(buildDeliveryInvestigationSteps())
  })

  it('SSR 首屏 = Step 1：可见现象，隐藏数据文件、批次与完成信号', () => {
    const markup = renderToStaticMarkup(<DeliveryInvestigationLab />)

    expect(markup).toContain('data-diagram-type="flow"')
    expect(markup).toContain('Step 1 / 7')
    expect(markup).toContain('现象：任务 SUCCESS，下游没有数据')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain('aria-valuenow="1"')
    expect(markup).toContain('role="group"')
    expect(markup).toContain('上一步')
    expect(markup).toContain('下一步')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('SUCCESS')
    expect(markup).toContain('无数据（等待中）')
    expect(markup).toContain('2026-09-30')

    for (const leak of [
      'account_balance_snapshot_20260930',
      '20260930',
      deriveCompletionSignalName(fixture.batchId),
      'completion_signal',
      'Completion Signal',
      'data_file',
      'Data File',
      'Receiver',
      '接收端',
      'batch_id',
      'failure boundary',
      'Flag',
      'flag',
      '根因',
      '已交付',
      '交付完成',
    ]) {
      expect(markup, `Step 1 不应出现 ${leak}`).not.toContain(leak)
    }
  })

  it('Step 2 只证明生产侧完成，不出现完成信号 / 交付完成 / 已识别', () => {
    const steps = buildDeliveryInvestigationSteps()
    const step2 = steps[1]!

    expect(step2.description).toContain('生产侧已经完成')
    for (const forbidden of [
      '交付完成',
      '完成信号',
      '已识别',
      'Consumer 健康',
      'failure boundary',
    ]) {
      expect(step2.description, `Step 2 不应出现 ${forbidden}`).not.toContain(forbidden)
    }

    const fields = getDeliveryEvidenceRows(step2.state, step2.highlight!.reveal).map(
      (row) => row.field,
    )
    expect(fields).toEqual([
      'Producer Job',
      'business_date',
      'batch_id',
      'Data File',
      'Row Count',
      'Consumer',
    ])
    expect(fields).not.toContain('Completion Signal')
    expect(fields).not.toContain('Receiver')
  })

  it('Step 3 只暴露 observation：无 failure boundary、无最终状态、无 Consumer 健康', () => {
    const steps = buildDeliveryInvestigationSteps()
    const step3 = steps[2]!

    expect(step3.description).toContain('当前证据不支持 Consumer 执行失败')
    for (const forbidden of [
      'failure boundary',
      '已传输但未被识别',
      'Consumer 健康',
      '根因',
      '已定位',
    ]) {
      expect(step3.description, `Step 3 不应出现 ${forbidden}`).not.toContain(forbidden)
    }
    expect(step3.state.localization).toBeNull()
    expect(step3.highlight?.reveal.stateLadder).toBe(false)
    expect(step3.highlight?.reveal.localization).toBe(false)
  })

  it('Step 4 才出现明确 localization', () => {
    const steps = buildDeliveryInvestigationSteps()
    const step4 = steps[3]!

    expect(step4.description).toContain('断点定位在完成信号边界')
    expect(step4.description).toContain('已到达接收端')
    expect(step4.state.localization?.state).toBe('delivered-not-recognized')
    expect(step4.highlight?.reveal.localization).toBe(true)
  })

  it('Step 5 的修复前提顺序是 artifact validation → signal restore', () => {
    const steps = buildDeliveryInvestigationSteps()
    const step5 = steps[4]!

    expect(step5.state.artifactValidation?.passed).toBe(true)
    expect(step5.state.repair?.restored).toBe(true)
    expect(step5.state.consumption).toBeNull()
    expect(step5.description.indexOf('先验证 data artifact')).toBeLessThan(
      step5.description.indexOf('并幂等恢复 completion signal'),
    )
    expect(step5.description).toContain('不是通用规则')
  })

  it('Step 6 有 5 项验证，Step 7 的 contract 只有 5 个字段', () => {
    const steps = buildDeliveryInvestigationSteps()

    expect(steps[5]!.state.verification).toHaveLength(5)
    expect(steps[6]!.highlight?.reveal.contract).toBe(true)

    const fields = getDeliveryContractFields()
    expect(fields.map((field) => field.name)).toEqual([
      'business_date',
      'batch_id',
      'data_file',
      'completion_signal',
      'row_count_or_size',
    ])
    expect(fields.map((field) => field.name)).not.toContain('consumer_acknowledgement')
  })
})

describe('生产案例 13-2 · 课程注册与导航', () => {
  it('第 13 章注册 13-1 + 13-2，显示编号与 demo 正确', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '13')

    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual([
      'lifecycle-path-failure',
      'delivery-completion-signal',
    ])
    expect(getLessonBySlug('delivery-completion-signal')).toMatchObject({
      id: 'lesson-13-2',
      slug: 'delivery-completion-signal',
      chapter: '13',
      order: 200,
      difficulty: 'advanced',
      estimatedMinutes: 18,
      demo: 'delivery-investigation',
      title: '任务 SUCCESS，为什么下游没有拿到数据？',
    })
  })

  it('13-2 与 13-1 相邻导航连续', () => {
    expect(getAdjacentLessons(lessons, 'lifecycle-path-failure').next?.slug).toBe(
      'delivery-completion-signal',
    )
    expect(getAdjacentLessons(lessons, 'delivery-completion-signal').previous?.slug).toBe(
      'lifecycle-path-failure',
    )
    expect(getAdjacentLessons(lessons, 'delivery-completion-signal').next).toBeUndefined()
  })

  it('13-2 正文只注册一个 delivery-investigation 实验', () => {
    const lesson = getLessonBySlug('delivery-completion-signal')
    expect(lesson).toBeDefined()

    const content = getLessonContent(lesson!)
    const visualizations = content.sections
      .filter((section) => section.kind === 'visualization')
      .map((section) => section.visualization)

    expect(visualizations).toEqual([{ kind: 'delivery-investigation' }])
    expect(JSON.stringify(content)).toContain('10-3')
    expect(JSON.stringify(content)).toContain('Job SUCCESS ≠ Delivery SUCCESS')
  })
})
