/**
 * 生产实践案例 13-2 · 7 步确定性教学序列。
 *
 * Step 1 只显示现象；Step 2 只证明生产侧完成；Step 3 只暴露 observation；
 * Step 4 才对照批次键并命名 failure boundary；Step 5 先验证 artifact 再恢复
 * 完成信号；Step 6 做 5 项端到端验证；Step 7 输出最小 Delivery Contract。
 *
 * 每一步都直接携带完整快照与 reveal 语义，prev / next / reset 只做 index 推进。
 */

import {
  createStepKernel,
  type StepKernel,
  type VisualizationStep,
} from '../../utils/visualization-steps'
import {
  accountBalanceDeliveryFixture,
  createConsumerEvidence,
  createInitialExchange,
  createProducerArtifact,
  deriveCompletionSignalName,
  evaluateConsumer,
  localizeDeliveryFailure,
  restoreCompletionSignal,
  validateDeliveryArtifact,
  verifyDelivery,
} from './model'
import type {
  DeliveryInvestigationHighlight,
  DeliveryInvestigationState,
  DeliveryReveal,
} from './types'

export type DeliveryInvestigationStep = VisualizationStep<
  DeliveryInvestigationState,
  DeliveryInvestigationHighlight
>

const fixture = accountBalanceDeliveryFixture

const NO_REVEAL: DeliveryReveal = {
  businessDate: false,
  batchId: false,
  producerArtifact: false,
  receiverObservation: false,
  consumerEvidence: false,
  completionObservation: false,
  elimination: false,
  stateLadder: false,
  localization: false,
  artifactValidation: false,
  repair: false,
  verification: false,
  contract: false,
}

function reveal(overrides: Partial<DeliveryReveal>): DeliveryReveal {
  return { ...NO_REVEAL, ...overrides }
}

export function buildDeliveryInvestigationSteps(): readonly DeliveryInvestigationStep[] {
  const producer = createProducerArtifact(fixture)
  const brokenExchange = createInitialExchange(fixture)
  const baseline = createConsumerEvidence(fixture)

  const localization = localizeDeliveryFailure(fixture, producer, brokenExchange, baseline)
  const artifactValidation = validateDeliveryArtifact(fixture, producer, brokenExchange)
  const repair = restoreCompletionSignal(fixture, brokenExchange, artifactValidation)
  const consumption = evaluateConsumer(fixture, baseline, repair.exchange)
  const verification = verifyDelivery(
    fixture,
    producer,
    repair.exchange,
    consumption.consumer,
    artifactValidation,
    baseline,
  )

  const baseState = (): DeliveryInvestigationState => ({
    producer,
    exchange: brokenExchange,
    consumer: baseline,
    baseline,
    artifactValidation: null,
    repair: null,
    consumption: null,
    localization: null,
    verification: [],
  })

  const locatedState = (): DeliveryInvestigationState => ({
    ...baseState(),
    localization,
  })

  const repairedState = (): DeliveryInvestigationState => ({
    ...locatedState(),
    exchange: repair.exchange,
    artifactValidation,
    repair,
  })

  const verifiedState = (): DeliveryInvestigationState => ({
    ...repairedState(),
    consumer: consumption.consumer,
    consumption,
    verification,
  })

  return [
    {
      id: 'symptom',
      title: '现象：任务 SUCCESS，下游没有数据',
      description: `${fixture.producerTask} 在 ${fixture.businessDate} 的运行结果为 SUCCESS；下游 Consumer 没有拿到该业务日的数据，也没有报错。先确认现象，不急着下结论。`,
      state: baseState(),
      highlight: {
        kind: 'symptom',
        focus: 'chain',
        risk: false,
        reveal: reveal({ businessDate: true }),
      },
    },
    {
      id: 'producer-evidence',
      title: '证据：数据文件已经产出',
      description: `Producer 输出目录里先出现临时文件，随后完成最终命名：${producer.dataFileName}，business_date = ${producer.businessDate}，batch_id = ${producer.batchId}，共 ${producer.rowCount} 行。这证明生产侧已经完成，还不能说明数据已经交付给消费者。`,
      state: baseState(),
      highlight: {
        kind: 'producer-evidence',
        focus: 'producer',
        risk: false,
        reveal: reveal({ businessDate: true, batchId: true, producerArtifact: true }),
      },
    },
    {
      id: 'chain-observations',
      title: '证据：交付链现状',
      description: `在放大的交付链上收集 observation：接收端已经有本批次的 final 数据文件；Consumer 进程运行中，上一批次 ${fixture.previousBatchId} 已消费，本批次没有执行尝试；同一批次的 completion signal 在接收端不存在。当前证据不支持 Consumer 执行失败，但还没有完成定位。`,
      state: baseState(),
      highlight: {
        kind: 'observation',
        focus: 'chain',
        risk: true,
        reveal: reveal({
          businessDate: true,
          batchId: true,
          producerArtifact: true,
          receiverObservation: true,
          consumerEvidence: true,
          completionObservation: true,
          elimination: true,
        }),
      },
    },
    {
      id: 'completion-signal-localization',
      title: '定位：完成信号边界未闭合',
      description: `把 business_date 与 batch_id 对齐到期望的完成信号 ${deriveCompletionSignalName(
        fixture.batchId,
      )}：接收端只有上一批次的信号，本批次信号缺失，Consumer 触发条件不满足。断点定位在完成信号边界——数据已到达接收端，但未被识别；「已识别但未消费」因本批次没有任何执行尝试而被排除。`,
      state: locatedState(),
      highlight: {
        kind: 'localization',
        focus: 'exchange',
        risk: true,
        reveal: reveal({
          businessDate: true,
          batchId: true,
          producerArtifact: true,
          receiverObservation: true,
          consumerEvidence: true,
          completionObservation: true,
          elimination: true,
          stateLadder: true,
          localization: true,
        }),
      },
    },
    {
      id: 'artifact-first-repair',
      title: '处理：先验证 artifact，再恢复完成信号',
      description: `先验证 data artifact：最终命名、接收端可读、batch identity 匹配、行数有效。四项通过后，才由 batch identity 推导 ${repair.expectedSignalName} 并幂等恢复 completion signal。本案例不重跑上游 DAG，这是 artifact 已确认正确时的最小 blast-radius 决策，不是通用规则。`,
      state: repairedState(),
      highlight: {
        kind: 'repair',
        focus: 'exchange',
        risk: false,
        reveal: reveal({
          businessDate: true,
          batchId: true,
          producerArtifact: true,
          receiverObservation: true,
          consumerEvidence: true,
          completionObservation: true,
          elimination: true,
          stateLadder: true,
          localization: true,
          artifactValidation: true,
          repair: true,
        }),
      },
    },
    {
      id: 'end-to-end-verification',
      title: '验证：end-to-end 5 项检查',
      description: `恢复 completion signal 后重新评估 Consumer：本批次被消费一次，共 ${
        consumption.consumedRowCount ?? 0
      } 行。5 项检查全部从 fixture 状态计算：artifact 完整可读、signal identity 连续、恰好一次消费、无其他批次副作用、行数一致。`,
      state: verifiedState(),
      highlight: {
        kind: 'verification',
        focus: 'consumer',
        risk: false,
        reveal: reveal({
          businessDate: true,
          batchId: true,
          producerArtifact: true,
          receiverObservation: true,
          consumerEvidence: true,
          completionObservation: true,
          stateLadder: true,
          localization: true,
          artifactValidation: true,
          repair: true,
          verification: true,
        }),
      },
    },
    {
      id: 'delivery-contract',
      title: '防复发：最小 Delivery Contract',
      description:
        '把这次调查固化为最小 Delivery Contract：business_date、batch_id、data_file、completion_signal、row_count_or_size 五个字段。它们直接对应本案例的证据，不引入本案例没有建模的 ACK。',
      state: verifiedState(),
      highlight: {
        kind: 'prevention',
        focus: 'chain',
        risk: false,
        reveal: reveal({
          businessDate: true,
          batchId: true,
          producerArtifact: true,
          receiverObservation: true,
          consumerEvidence: true,
          completionObservation: true,
          stateLadder: true,
          localization: true,
          artifactValidation: true,
          repair: true,
          verification: true,
          contract: true,
        }),
      },
    },
  ]
}

export function createDeliveryInvestigationKernel(): StepKernel<
  DeliveryInvestigationState,
  DeliveryInvestigationHighlight
> {
  return createStepKernel(buildDeliveryInvestigationSteps())
}
