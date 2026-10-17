/**
 * 依赖链重做专题 · 实验步骤内核。
 *
 * E1 事故时间线与污染传播：
 * 用 `completed` 事故快照走一条 7 步时间线：ODS 分区不完整 → 完整性校验缺口 →
 * DWD 明细 → DWS 两支汇总 → ADS 汇合 → 消费端已装载旧结果 → 事故结论。
 * 每一步都携带确定性完整快照：节点可见性、污染标记、本步证据与本步小结。
 *
 * 播放器只维护 index，无 timer / autoplay；步骤不修改 fixture。
 */

import {
  createStepKernel,
  type StepKernel,
  type VisualizationStep,
} from '../../utils/visualization-steps'
import {
  REPROCESSING_INCIDENT_BUSINESS_DATE,
  REPROCESSING_SOURCE_INSTANCE_ID,
  REPROCESSING_TASK_IDS,
  createReprocessingFixture,
} from './fixture'
import { analyzeReprocessingImpact, orderTaskIdsByDependencies } from './model'
import type {
  ImpactAnalysis,
  ReprocessingLayer,
  ReprocessingModel,
  TaskInstanceState,
} from './types'

export type IncidentTimelineStepKind =
  | 'arrival'
  | 'validation-gap'
  | 'detail-propagation'
  | 'branch-fanout'
  | 'merge-propagation'
  | 'consumer-delivery'
  | 'conclusion'

export interface IncidentTimelineNode {
  instanceId: string
  taskId: string
  label: string
  layer: ReprocessingLayer
  state: TaskInstanceState
  /** 时间线是否已经走到这个节点。 */
  revealed: boolean
  /** 该节点是否处于本次事故的污染传播范围。 */
  contaminated: boolean
  note: string
}

export interface IncidentTimelineState {
  nodes: readonly IncidentTimelineNode[]
  revealedCount: number
  totalCount: number
  /** 本步小结：当前证据支持的事故结论。 */
  conclusion: string
}

export interface IncidentTimelineHighlight {
  kind: IncidentTimelineStepKind
  focusTaskIds: readonly string[]
  /** 本步新增的可观察证据。 */
  newEvidence: readonly string[]
}

export type IncidentTimelineStep = VisualizationStep<
  IncidentTimelineState,
  IncidentTimelineHighlight
>

const TASK = REPROCESSING_TASK_IDS

const NODE_NOTES: Readonly<Record<string, string>> = {
  [TASK.ingestTransaction]: '接入任务 SUCCESS；分区文件只校验「到达」，没有校验内容完整。',
  [TASK.checkTransactionCompleteness]:
    '完整性校验任务 SUCCESS；控制表登记完整，但没有核对交易明细覆盖。',
  [TASK.dwdTransactionDetail]: 'DWD 明细加工 SUCCESS；行数比前一日少 12%，任务没有报错。',
  [TASK.dwsMerchantTransaction]:
    'DWS 商户汇总 SUCCESS；LEFT JOIN 读取商户资料，输入被污染仍然继续。',
  [TASK.dwsChannelTransaction]: 'DWS 渠道汇总 SUCCESS；与商户汇总共享同一份 DWD 明细输入。',
  [TASK.adsTransactionReport]: 'ADS 报表 SUCCESS；多支汇合，错误数据进入发布结果。',
  [TASK.consumeTransactionReport]: '报表推送 SUCCESS；旧结果已经装入消费端。',
  [TASK.deliverTransactionFile]: '文件投递 SUCCESS；旧结果文件已经到达接收端。',
}

const REVEAL_BY_STEP: Readonly<Record<IncidentTimelineStepKind, readonly string[]>> = {
  arrival: [TASK.ingestTransaction],
  'validation-gap': [TASK.checkTransactionCompleteness],
  'detail-propagation': [TASK.dwdTransactionDetail],
  'branch-fanout': [TASK.dwsMerchantTransaction, TASK.dwsChannelTransaction],
  'merge-propagation': [TASK.adsTransactionReport],
  'consumer-delivery': [TASK.consumeTransactionReport, TASK.deliverTransactionFile],
  conclusion: Object.values(TASK),
}

interface IncidentTimelineStepSpec {
  id: IncidentTimelineStepKind
  title: string
  description: string
  conclusion: string
  newEvidence: readonly string[]
}

const STEP_SPECS: readonly IncidentTimelineStepSpec[] = [
  {
    id: 'arrival',
    title: '时间线起点：ODS 分区文件已经到达',
    description:
      '2026-10-16 的 ODS_TRANSACTION 分区文件已经在控制表登记，接入任务执行 SUCCESS。文件「到达」和任务「成功」只说明接入流程走完了，还没有证明这个分区的内容是完整的。',
    conclusion: '接入任务 SUCCESS 只代表文件被处理，不代表分区内容完整。',
    newEvidence: ['ODS_TRANSACTION 2026-10-16 分区文件已在控制表登记', '接入任务状态为 SUCCESS'],
  },
  {
    id: 'validation-gap',
    title: '完整性校验通过，但只核对了控制表',
    description:
      '完整性校验任务也执行 SUCCESS：它读取控制表登记的到达文件，没有对照交易明细做覆盖核对。这是本次事故的关键缺口——校验存在，但证据强度不足以拦住不完整分区。',
    conclusion: '校验任务 SUCCESS 不等于数据质量门禁已经成立。',
    newEvidence: [
      '完整性校验只读取控制表登记，没有核对交易明细覆盖',
      '校验任务通过后，依赖它的下游被正常放行',
    ],
  },
  {
    id: 'detail-propagation',
    title: '污染传播：DWD 明细带着缺口加工完成',
    description:
      'DWD 明细加工读取了不完整的 ODS_TRANSACTION 分区，仍然成功写出明细：行数比前一日少 12%，但任务状态是 SUCCESS。错误数据从源分区进入仓库内部，第一次具备了向下游扩散的条件。',
    conclusion: 'SUCCESS 只说明加工执行完成，不说明输出数据正确。',
    newEvidence: ['DWD 明细行数 88，前一日 100（-12%）', 'DWD 任务状态仍为 SUCCESS'],
  },
  {
    id: 'branch-fanout',
    title: '污染传播：DWS 两支汇总同时接收错误明细',
    description:
      'DWS 商户汇总和渠道汇总都以 DWD 明细为输入。商户汇总还 LEFT JOIN 了商户资料：即使连接结果看起来没有变化，输入血缘已经被污染，这一支同样必须纳入重做范围。两支汇总都执行 SUCCESS。',
    conclusion: 'LEFT JOIN 的任务不会因为「结果看起来没变」而自动退出重做范围。',
    newEvidence: [
      'DWS 商户支 LEFT JOIN 商户资料后继续执行',
      'DWS 渠道支与商户支共享同一份被污染的 DWD 输入',
    ],
  },
  {
    id: 'merge-propagation',
    title: '污染传播：ADS 多支汇合后发布错误结果',
    description:
      'ADS 报表同时读取商户支和渠道支：两条支路汇合到同一个发布结果。到这一步，错误数据已经穿过调度依赖与 SQL 血缘两种关系，进入对外发布层。',
    conclusion: '多支汇合不会消除污染：汇合节点的输入只要有一条被污染，输出就同样受影响。',
    newEvidence: ['ADS 发布结果包含缺失交易', '没有任务因为数据不完整而失败'],
  },
  {
    id: 'consumer-delivery',
    title: '污染到达消费端：任务 SUCCESS，数据已装错',
    description:
      '报表推送与文件投递都执行 SUCCESS：旧结果已经装入消费端。数仓内部的任务状态全部正常，但消费端拿到的是错误数据——这正是「任务成功、数据错误」最危险的形态。',
    conclusion: '数仓任务 SUCCESS 不等于消费端拿到正确数据。',
    newEvidence: [
      '报表推送已装入消费端',
      '文件投递已到达接收端',
      '消费端当前装载的是重做前的旧结果',
    ],
  },
  {
    id: 'conclusion',
    title: '结论：按血缘 + 调度依赖圈定重做范围',
    description:
      '把时间线的证据收拢：8 个实例已经执行并进入重做范围，包括 LEFT JOIN 商户支；机构链路和前一日分区不在影响范围，不应被误停。下一步先停止受影响链路、等待 ODS 修复验证，再按依赖顺序重做，而不是只重跑某个报错任务。',
    conclusion: '受影响实例全部重做；无关链路不被误伤；先止损、再验证、后重做。',
    newEvidence: [
      '受影响实例共 8 个：已执行并进入重做范围',
      '机构链路与前一日分区不在影响范围',
      '执行顺序：先停止 → ODS 验证 → 按依赖重做',
    ],
  },
]

/** 构造 E1 的 7 步确定性时间线。 */
export function buildIncidentTimelineSteps(): readonly IncidentTimelineStep[] {
  const model = createReprocessingFixture({ variant: 'completed' })
  const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
  const orderedTaskIds = orderTaskIdsByDependencies(model, analysis.deduplicatedTaskIds)
  const affectedTaskIds = new Set(analysis.deduplicatedTaskIds)

  const nodesByTaskId = new Map(
    orderedTaskIds.map((taskId) => {
      const task = model.tasks.find((candidate) => candidate.taskId === taskId)
      const instance = model.instances.find(
        (candidate) => candidate.instanceId === `${taskId}@${REPROCESSING_INCIDENT_BUSINESS_DATE}`,
      )
      if (!task || !instance) {
        throw new Error(`E1 时间线缺少任务实例: ${taskId}`)
      }
      return [
        taskId,
        {
          instanceId: instance.instanceId,
          taskId,
          label: task.label,
          layer: task.layer,
          state: instance.state,
          note: NODE_NOTES[taskId] ?? '该任务已被事故影响。',
        },
      ] as const
    }),
  )

  const revealedTaskIds = new Set<string>()
  return STEP_SPECS.map((spec) => {
    for (const taskId of REVEAL_BY_STEP[spec.id]) {
      revealedTaskIds.add(taskId)
    }

    const nodes: IncidentTimelineNode[] = orderedTaskIds.map((taskId) => {
      const node = nodesByTaskId.get(taskId)
      if (!node) throw new Error(`E1 时间线缺少节点: ${taskId}`)
      const revealed = revealedTaskIds.has(taskId)
      return {
        ...node,
        revealed,
        contaminated: revealed && affectedTaskIds.has(taskId),
      }
    })

    return {
      id: spec.id,
      title: spec.title,
      description: spec.description,
      state: {
        nodes,
        revealedCount: nodes.filter((node) => node.revealed).length,
        totalCount: nodes.length,
        conclusion: spec.conclusion,
      },
      highlight: {
        kind: spec.id,
        focusTaskIds: REVEAL_BY_STEP[spec.id],
        newEvidence: spec.newEvidence,
      },
    } satisfies IncidentTimelineStep
  })
}

export function createIncidentTimelineKernel(): StepKernel<
  IncidentTimelineState,
  IncidentTimelineHighlight
> {
  return createStepKernel(buildIncidentTimelineSteps())
}

/* ------------------------------------------------------------------ *
 * E2 影响范围：四类集合、去重清单与影响证据
 * ------------------------------------------------------------------ */

/** 事故链上的 8 个任务（与 E1 时间线一致）。 */
export const REPROCESSING_INCIDENT_CHAIN_TASK_IDS: readonly string[] = Object.freeze([
  TASK.ingestTransaction,
  TASK.checkTransactionCompleteness,
  TASK.dwdTransactionDetail,
  TASK.dwsMerchantTransaction,
  TASK.dwsChannelTransaction,
  TASK.adsTransactionReport,
  TASK.consumeTransactionReport,
  TASK.deliverTransactionFile,
])

export type ImpactScopeSetId = 'stop' | 'redo' | 'waiting' | 'notify'

export interface ImpactScopeSet {
  id: ImpactScopeSetId
  label: string
  description: string
  instanceIds: readonly string[]
}

/** 一条影响证据，已把任务 id 替换为可读名称。 */
export interface ImpactScopeEvidenceRow {
  id: string
  kind: 'lineage' | 'scheduler'
  fromTaskId: string
  fromLabel: string
  toTaskId: string
  toLabel: string
  detail: string
}

export interface ImpactScopeViewModel {
  sourceInstanceId: string
  affectedInstanceIds: readonly string[]
  sets: readonly ImpactScopeSet[]
  deduplicatedTaskIds: readonly string[]
  evidenceRows: readonly ImpactScopeEvidenceRow[]
  /** 没有 SQL 血缘、仅由调度依赖进入范围的任务。 */
  schedulerOnlyTaskIds: readonly string[]
}

function taskLabelById(model: ReprocessingModel): ReadonlyMap<string, string> {
  return new Map(model.tasks.map((task) => [task.taskId, task.label]))
}

export function taskIdFromInstanceId(instanceId: string): string {
  const separatorIndex = instanceId.lastIndexOf('@')
  return separatorIndex >= 0 ? instanceId.slice(0, separatorIndex) : instanceId
}

/** 把影响分析结果投影为 E2 的四类集合、去重清单与证据列表。 */
export function buildImpactScopeViewModel(
  model: ReprocessingModel,
  sourceInstanceId: string,
): ImpactScopeViewModel {
  const analysis: ImpactAnalysis = analyzeReprocessingImpact(model, sourceInstanceId)
  const labels = taskLabelById(model)

  const sets: readonly ImpactScopeSet[] = [
    {
      id: 'stop',
      label: '停止集合',
      description: '正在运行 / 就绪：先停止或阻断，确认副作用后再进入等待。',
      instanceIds: analysis.stopRequiredInstanceIds,
    },
    {
      id: 'redo',
      label: '重做集合',
      description: '已经执行过：按血缘范围全部重做，包括 LEFT JOIN 后结果未变化的实例。',
      instanceIds: analysis.redoInstanceIds,
    },
    {
      id: 'waiting',
      label: '等待集合',
      description: '尚未首次执行：等待依赖满足后由调度重新调用，不伪称为已经重做。',
      instanceIds: analysis.waitingInstanceIds,
    },
    {
      id: 'notify',
      label: '通知集合',
      description: '受影响的消费方：数仓重做完成不等于消费端恢复，需要跟踪重新装数与确认。',
      instanceIds: analysis.consumerInstanceIds,
    },
  ]

  const incomingKinds = new Map<string, Set<'lineage' | 'scheduler'>>()
  for (const edge of analysis.evidence) {
    const kinds = incomingKinds.get(edge.toInstanceId) ?? new Set()
    kinds.add(edge.kind)
    incomingKinds.set(edge.toInstanceId, kinds)
  }

  const schedulerOnlyTaskIds: string[] = []
  for (const instanceId of analysis.affectedInstanceIds) {
    const kinds = incomingKinds.get(instanceId)
    if (!kinds || kinds.size !== 1 || !kinds.has('scheduler')) continue
    const taskId = taskIdFromInstanceId(instanceId)
    if (!schedulerOnlyTaskIds.includes(taskId)) {
      schedulerOnlyTaskIds.push(taskId)
    }
  }

  const evidenceRows: readonly ImpactScopeEvidenceRow[] = analysis.evidence.map((edge, index) => {
    const fromTaskId = taskIdFromInstanceId(edge.fromInstanceId)
    const toTaskId = taskIdFromInstanceId(edge.toInstanceId)
    return {
      id: `${index}:${edge.fromInstanceId}->${edge.toInstanceId}`,
      kind: edge.kind,
      fromTaskId,
      fromLabel: labels.get(fromTaskId) ?? fromTaskId,
      toTaskId,
      toLabel: labels.get(toTaskId) ?? toTaskId,
      detail: edge.detail,
    }
  })

  return {
    sourceInstanceId,
    affectedInstanceIds: analysis.affectedInstanceIds,
    sets,
    deduplicatedTaskIds: analysis.deduplicatedTaskIds,
    evidenceRows,
    schedulerOnlyTaskIds,
  }
}
