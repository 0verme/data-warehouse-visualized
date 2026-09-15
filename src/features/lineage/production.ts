import type { LineageEdge, LineageEvidence, LineageNode } from '../../types'
import type { SchedulerTaskDefinition, SchedulerVisualization } from '../scheduler/types'
import type {
  SqlTransformationVisualization,
  TransformationStepId,
} from '../sql-transformation/types'
import {
  SCHEDULER_TASK_IDS,
  buildSchedulerTimeline,
  createInitialSchedulerRun,
} from '../../utils/scheduler'
import { getTransformationStep } from '../../utils/sql-transformation'
import type {
  LineageInvestigationContext,
  LineageInvestigationEventDefinition,
  LineageProductionEdge,
  LineageProductionNode,
} from './types'

export interface LineageProductionBindingInput {
  baseNodes: readonly LineageNode[]
  baseEdges: readonly LineageEdge[]
  transformation: SqlTransformationVisualization
  scheduler: SchedulerVisualization
}

export interface LineageProductionGraph {
  nodes: LineageProductionNode[]
  edges: LineageProductionEdge[]
  investigationEvents: LineageInvestigationEventDefinition[]
}

const TASK_NODE_IDS: Readonly<Record<string, string>> = {
  [SCHEDULER_TASK_IDS.odsOrders]: 'task-load-order',
  [SCHEDULER_TASK_IDS.dwd]: 'task-build-order-detail',
  [SCHEDULER_TASK_IDS.dws]: 'task-build-sales',
  [SCHEDULER_TASK_IDS.ads]: 'task-publish-report',
}

const REQUIRED_TASK_IDS = [
  SCHEDULER_TASK_IDS.odsOrders,
  SCHEDULER_TASK_IDS.dwd,
  SCHEDULER_TASK_IDS.dws,
  SCHEDULER_TASK_IDS.ads,
] as const

type EdgeBinding = {
  stepId?: TransformationStepId
  taskId?: string
  evidence?: 'metric' | 'manual'
  confidence: NonNullable<LineageEdge['confidence']>
}

const EDGE_BINDINGS: Readonly<Record<string, EdgeBinding>> = {
  'ods-order->dwd-order-detail': {
    stepId: 'fix-join',
    taskId: SCHEDULER_TASK_IDS.dwd,
    confidence: 'confirmed',
  },
  'dwd-order-detail->dws-sales': {
    stepId: 'build-dws',
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'dws-sales->ads-report': {
    evidence: 'metric',
    confidence: 'inferred',
  },
  'dws-user->ads-report': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'field-dwd-order-status->task-build-order-detail': {
    taskId: SCHEDULER_TASK_IDS.dwd,
    confidence: 'confirmed',
  },
  'task-build-order-detail->dwd-order-detail': {
    stepId: 'fix-join',
    taskId: SCHEDULER_TASK_IDS.dwd,
    confidence: 'confirmed',
  },
  'dwd-order-detail->task-build-sales': {
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'dwd-order-detail->task-build-user': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'task-build-sales->dws-sales': {
    stepId: 'build-dws',
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'task-build-user->dws-user': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'dws-sales->metric-sales-status-rate': {
    evidence: 'metric',
    confidence: 'confirmed',
  },
  'dws-user->metric-user-status-rate': {
    evidence: 'metric',
    confidence: 'inferred',
  },
  'task-build-sales->field-dws-sales-status': {
    stepId: 'build-dws',
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'task-build-user->field-dws-user-status': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'field-dws-sales-status->task-publish-report': {
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'inferred',
  },
  'field-dws-user-status->task-publish-report': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'task-publish-report->ads-report': {
    stepId: 'build-ads',
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'confirmed',
  },
  'task-publish-report->field-ads-report-status': {
    stepId: 'build-ads',
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'confirmed',
  },
  'field-ads-report-status->metric-report-status': {
    evidence: 'metric',
    confidence: 'confirmed',
  },
  'metric-sales-status-rate->metric-report-status': {
    evidence: 'metric',
    confidence: 'inferred',
  },
  'metric-user-status-rate->metric-report-status': {
    evidence: 'metric',
    confidence: 'inferred',
  },
  'field-ods-order-status->field-dwd-order-status': {
    stepId: 'deduplicate',
    taskId: SCHEDULER_TASK_IDS.dwd,
    confidence: 'confirmed',
  },
  'field-dwd-order-status->field-dws-sales-status': {
    stepId: 'build-dws',
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'field-dwd-order-status->field-dws-user-status': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'field-dws-sales-status->field-ads-report-status': {
    stepId: 'build-ads',
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'inferred',
  },
  'field-dws-user-status->field-ads-report-status': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'task-load-order->task-build-order-detail': {
    taskId: SCHEDULER_TASK_IDS.dwd,
    confidence: 'confirmed',
  },
  'task-build-order-detail->task-build-sales': {
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'task-build-order-detail->task-build-user': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'task-build-sales->task-publish-report': {
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'inferred',
  },
  'task-build-user->task-publish-report': {
    evidence: 'manual',
    confidence: 'manual',
  },
}

function edgeKey(edge: Pick<LineageEdge, 'source' | 'target'>): string {
  return `${edge.source}->${edge.target}`
}

function getTask(
  tasks: readonly SchedulerTaskDefinition[],
  taskId: string,
): SchedulerTaskDefinition {
  const task = tasks.find((candidate) => candidate.taskId === taskId)
  if (!task) {
    throw new Error(`血缘绑定找不到 Scheduler task: ${taskId}`)
  }

  return task
}

function getTaskNodeId(taskId: string): string {
  const nodeId = TASK_NODE_IDS[taskId]
  if (!nodeId) {
    throw new Error(`血缘绑定没有为 Scheduler task 配置节点: ${taskId}`)
  }

  return nodeId
}

function createSqlEvidence(
  transformation: SqlTransformationVisualization,
  schedulerTask: SchedulerTaskDefinition | undefined,
  stepId: TransformationStepId,
): LineageEvidence {
  const step = getTransformationStep(stepId)
  const taskContext = schedulerTask
    ? `Scheduler task ${schedulerTask.taskId} 负责运行这一步`
    : `SQL task contract ${transformation.taskContract.taskId} 负责运行这一步`
  const outputTable = schedulerTask?.contract.outputTable ?? transformation.taskContract.outputTable

  return {
    source: 'sql_transformation',
    detail: `SQL transformation 证据：${step?.title ?? stepId}（${step?.layer ?? '未标注层级'}）。${taskContext}，输出 ${outputTable}，分区 ${transformation.taskContract.partition.column} = ${transformation.taskContract.partition.value}。`,
  }
}

function createTaskEvidence(
  task: SchedulerTaskDefinition,
  relation: LineageEdge['relation'],
): LineageEvidence {
  const dependencies = task.dependsOn.length > 0 ? task.dependsOn.join('、') : '无'
  const relationText = relation === 'depends_on' ? 'DAG dependsOn' : '任务消费/生产映射'

  return {
    source: 'task_dependency',
    detail: `Scheduler ${relationText} 证据：${task.taskId}（${task.label}）依赖 ${dependencies}，输出 ${task.contract.outputTable}；任务 identity 与第 06 章一致。`,
  }
}

function createMetricEvidence(): LineageEvidence {
  return {
    source: 'metric_definition',
    detail:
      '指标定义证据：该对象被 order_status 指标口径引用；它说明消费关系，不自动证明业务因果。',
  }
}

function createManualEvidence(edge: LineageEdge, nodes: readonly LineageNode[]): LineageEvidence {
  const source = nodes.find((node) => node.id === edge.source)?.label ?? edge.source
  const target = nodes.find((node) => node.id === edge.target)?.label ?? edge.target

  return {
    source: 'manual_metadata',
    detail: `教学扩展关系：${source} → ${target} 未由第 06 章 Scheduler task contract 直接声明；保留它用于解释用户主题分支，变更前需要回到元数据和业务语义确认。`,
  }
}

function bindNodes(
  nodes: readonly LineageNode[],
  schedulerTasks: readonly SchedulerTaskDefinition[],
): LineageProductionNode[] {
  return nodes.map((node) => {
    const taskId = Object.entries(TASK_NODE_IDS).find(([, nodeId]) => nodeId === node.id)?.[0]
    if (taskId) {
      const task = getTask(schedulerTasks, taskId)
      return {
        ...node,
        role: `${node.role} · ${task.taskId}`,
        schedulerTaskId: task.taskId,
      }
    }

    if (node.id === 'task-build-user') {
      return {
        ...node,
        role: `${node.role} · manual teaching branch（#12 未声明对应 task）`,
      }
    }

    return { ...node }
  })
}

function bindEdges(
  edges: readonly LineageEdge[],
  nodes: readonly LineageNode[],
  transformation: SqlTransformationVisualization,
  schedulerTasks: readonly SchedulerTaskDefinition[],
): LineageProductionEdge[] {
  return edges.map((edge) => {
    const binding = EDGE_BINDINGS[edgeKey(edge)]
    const schedulerTask = binding?.taskId ? getTask(schedulerTasks, binding.taskId) : undefined
    let evidence: LineageEvidence

    if (binding?.stepId) {
      evidence = createSqlEvidence(transformation, schedulerTask, binding.stepId)
    } else if (binding?.taskId) {
      evidence = createTaskEvidence(schedulerTask!, edge.relation)
    } else if (binding?.evidence === 'metric') {
      evidence = createMetricEvidence()
    } else if (binding?.evidence === 'manual') {
      evidence = createManualEvidence(edge, nodes)
    } else {
      evidence = edge.evidence ?? createManualEvidence(edge, nodes)
    }

    return {
      ...edge,
      evidence,
      confidence: binding?.confidence ?? edge.confidence ?? 'manual',
      schedulerTaskId: binding?.taskId,
      transformationStepId: binding?.stepId,
    }
  })
}

function createFieldSemanticChangeEvent(): LineageInvestigationEventDefinition {
  return {
    id: 'investigate-order-status-change',
    entryPoint: 'field-semantic-change',
    label: '字段语义变化',
    summary: 'DWD.ORDER_DETAIL.order_status 的“已支付”口径发生变化。',
    sourceEntityId: 'field-dwd-order-status',
    eventType: 'field_change',
    affectedEntityId: 'metric-sales-status-rate',
    evidence: {
      source: 'manual_metadata',
      detail:
        '变更请求证据：order_status 的业务含义被重新定义；先沿 SQL 和 Scheduler 生产路径验证受影响指标。',
    },
  }
}

function createSchemaChangeEvent(): LineageInvestigationEventDefinition {
  return {
    id: 'investigate-order-status-schema-change',
    entryPoint: 'schema-change',
    label: 'schema / field change',
    summary: 'order_status 字段的类型或枚举契约准备变化，需要检查下游字段和报表。',
    sourceEntityId: 'field-dwd-order-status',
    eventType: 'field_change',
    affectedEntityId: 'field-ads-report-status',
    evidence: {
      source: 'manual_metadata',
      detail:
        'schema change 证据：字段契约变更尚未由 schema registry 自动采集；当前先用字段级路径定位需要复核的对象。',
    },
  }
}

function createTaskFailureEvent(
  scheduler: SchedulerVisualization,
): LineageInvestigationEventDefinition {
  const taskId = SCHEDULER_TASK_IDS.dwd
  const failedTask = getTask(scheduler.tasks, taskId)
  const timeline = buildSchedulerTimeline(
    createInitialSchedulerRun(scheduler.tasks, {
      businessDate: scheduler.targetDate,
      scenario: 'dwd-blocked',
    }),
  )
  const failedState = timeline.find((frame) => frame.taskRuns[taskId]?.status === 'failed')
  const failedTaskRun = failedState?.taskRuns[taskId]

  if (!failedState || !failedTaskRun || failedTaskRun.status !== 'failed') {
    throw new Error(`无法从 Scheduler 运行事实创建失败事件: ${taskId}`)
  }

  const context: LineageInvestigationContext = {
    taskId,
    runId: failedState.runId,
    businessDate: failedState.businessDate,
    partition: failedState.partition,
    attempt: failedTaskRun.attempt,
    status: failedTaskRun.status,
    dependencyState: failedTaskRun.dependencyState,
    outputState: failedTaskRun.outputState,
  }

  return {
    id: 'investigate-dwd-task-failure',
    entryPoint: 'task-failure',
    label: 'DWD task failure',
    summary: `${failedTask.taskId} 重试耗尽，DWS / ADS 需要沿任务依赖检查。`,
    sourceEntityId: getTaskNodeId(taskId),
    eventType: 'task_failure',
    affectedEntityId: 'metric-report-status',
    evidence: {
      source: 'task_dependency',
      detail: `Scheduler failure 证据：run ${failedState.runId} 的 ${failedTask.taskId} 在 attempt ${failedTaskRun.attempt} 失败，状态 ${failedTaskRun.status}，输出 ${failedTaskRun.outputState}；${failedTaskRun.failureReason ?? '需要检查任务日志'}。`,
    },
    context,
  }
}

function validateBindingInput(input: LineageProductionBindingInput): void {
  if (input.transformation.targetDate !== input.scheduler.targetDate) {
    throw new Error(
      `SQL transformation 与 Scheduler business date 不一致: ${input.transformation.targetDate} !== ${input.scheduler.targetDate}`,
    )
  }

  for (const taskId of REQUIRED_TASK_IDS) {
    getTask(input.scheduler.tasks, taskId)
  }

  const adsTask = getTask(input.scheduler.tasks, SCHEDULER_TASK_IDS.ads)
  if (
    adsTask.contract.taskId !== input.transformation.taskContract.taskId ||
    adsTask.contract.outputTable !== input.transformation.taskContract.outputTable
  ) {
    throw new Error(
      `Scheduler ADS task 没有复用 SQL task contract: ${adsTask.taskId} !== ${input.transformation.taskContract.taskId}`,
    )
  }
}

export function bindLineageProductionChain(
  input: LineageProductionBindingInput,
): LineageProductionGraph {
  validateBindingInput(input)

  return {
    nodes: bindNodes(input.baseNodes, input.scheduler.tasks),
    edges: bindEdges(input.baseEdges, input.baseNodes, input.transformation, input.scheduler.tasks),
    investigationEvents: [
      createFieldSemanticChangeEvent(),
      createSchemaChangeEvent(),
      createTaskFailureEvent(input.scheduler),
    ],
  }
}
