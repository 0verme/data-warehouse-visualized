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
import { BANKING_SCHEDULER_TASK_IDS } from '../scheduler/banking'
import { getTransformationStep } from '../../utils/sql-transformation'
import {
  LEGACY_BANKING_LINEAGE_TASK_NODE_IDS,
  LEGACY_ECOMMERCE_LINEAGE_TASK_NODE_IDS,
  LINEAGE_TASK_NODE_IDS,
} from './mapping'
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

const REQUIRED_TASK_IDS = [
  SCHEDULER_TASK_IDS.accountBalanceSnapshot,
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
  'ods-account-balance->dwd-deposit-balance': {
    stepId: 'clean-detail',
    taskId: SCHEDULER_TASK_IDS.dwd,
    confidence: 'confirmed',
  },
  'dwd-deposit-balance->dws-deposit-balance': {
    stepId: 'aggregate-layers',
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'dws-deposit-balance->ads-deposit-balance': {
    stepId: 'contract',
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'confirmed',
  },
  'dws-account-profile->ads-deposit-balance': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'field-dwd-balance->task-build-deposit-detail': {
    stepId: 'clean-detail',
    taskId: SCHEDULER_TASK_IDS.dwd,
    confidence: 'confirmed',
  },
  'task-build-deposit-detail->dwd-deposit-balance': {
    stepId: 'clean-detail',
    taskId: SCHEDULER_TASK_IDS.dwd,
    confidence: 'confirmed',
  },
  'dwd-deposit-balance->task-build-deposit-topic': {
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'dwd-deposit-balance->task-build-account-profile': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'task-build-deposit-topic->dws-deposit-balance': {
    stepId: 'aggregate-layers',
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'task-build-account-profile->dws-account-profile': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'dws-deposit-balance->metric-deposit-balance': {
    evidence: 'metric',
    confidence: 'confirmed',
  },
  'dws-account-profile->metric-account-coverage': {
    evidence: 'metric',
    confidence: 'inferred',
  },
  'task-build-deposit-topic->field-dws-balance': {
    stepId: 'aggregate-layers',
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'task-build-account-profile->field-dws-account-scope': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'field-dws-balance->task-publish-deposit-balance': {
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'inferred',
  },
  'field-dws-account-scope->task-publish-deposit-balance': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'task-publish-deposit-balance->ads-deposit-balance': {
    stepId: 'contract',
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'confirmed',
  },
  'task-publish-deposit-balance->field-ads-balance': {
    stepId: 'contract',
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'confirmed',
  },
  'field-ads-balance->metric-deposit-report': {
    evidence: 'metric',
    confidence: 'confirmed',
  },
  'metric-deposit-balance->metric-deposit-report': {
    evidence: 'metric',
    confidence: 'inferred',
  },
  'metric-account-coverage->metric-deposit-report': {
    evidence: 'metric',
    confidence: 'inferred',
  },
  'field-ods-balance->field-dwd-balance': {
    stepId: 'clean-detail',
    taskId: SCHEDULER_TASK_IDS.dwd,
    confidence: 'confirmed',
  },
  'field-dwd-balance->field-dws-balance': {
    stepId: 'aggregate-layers',
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'field-dwd-balance->field-dws-account-scope': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'field-dws-balance->field-ads-balance': {
    stepId: 'contract',
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'inferred',
  },
  'field-dws-account-scope->field-ads-balance': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'task-load-balance->task-build-deposit-detail': {
    taskId: SCHEDULER_TASK_IDS.dwd,
    confidence: 'confirmed',
  },
  'task-build-deposit-detail->task-build-deposit-topic': {
    taskId: SCHEDULER_TASK_IDS.dws,
    confidence: 'confirmed',
  },
  'task-build-deposit-detail->task-build-account-profile': {
    evidence: 'manual',
    confidence: 'manual',
  },
  'task-build-deposit-topic->task-publish-deposit-balance': {
    taskId: SCHEDULER_TASK_IDS.ads,
    confidence: 'inferred',
  },
  'task-build-account-profile->task-publish-deposit-balance': {
    evidence: 'manual',
    confidence: 'manual',
  },
}

function edgeKey(edge: Pick<LineageEdge, 'source' | 'target'>): string {
  return `${edge.source}->${edge.target}`
}

const SCHEDULER_TASK_ID_PAIRS = [
  [SCHEDULER_TASK_IDS.accountBalanceSnapshot, BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot],
  [SCHEDULER_TASK_IDS.account, BANKING_SCHEDULER_TASK_IDS.account],
  [SCHEDULER_TASK_IDS.customer, BANKING_SCHEDULER_TASK_IDS.customer],
  [SCHEDULER_TASK_IDS.product, BANKING_SCHEDULER_TASK_IDS.product],
  [SCHEDULER_TASK_IDS.branch, BANKING_SCHEDULER_TASK_IDS.branch],
  [SCHEDULER_TASK_IDS.dwd, BANKING_SCHEDULER_TASK_IDS.dwd],
  [SCHEDULER_TASK_IDS.dws, BANKING_SCHEDULER_TASK_IDS.dws],
  [SCHEDULER_TASK_IDS.ads, BANKING_SCHEDULER_TASK_IDS.ads],
] as const

function getTask(
  tasks: readonly SchedulerTaskDefinition[],
  taskId: string,
): SchedulerTaskDefinition {
  const pair = SCHEDULER_TASK_ID_PAIRS.find(([left, right]) => taskId === left || taskId === right)
  const task = tasks.find(
    (candidate) =>
      candidate.taskId === taskId || (pair?.some((id) => id === candidate.taskId) ?? false),
  )
  if (!task) {
    throw new Error(`血缘绑定找不到 Scheduler task: ${taskId}`)
  }

  return task
}

function createSqlEvidence(
  transformation: SqlTransformationVisualization,
  schedulerTask: SchedulerTaskDefinition | undefined,
  stepId: TransformationStepId,
): LineageEvidence {
  const step = getTransformationStep(stepId)
  const taskContext = schedulerTask
    ? `Scheduler task ${schedulerTask.taskId} 负责运行这一步`
    : `SQL 加工契约 ${transformation.taskContract.taskId} 负责运行这一步`
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
    detail: `Scheduler ${relationText} 证据：${task.taskId}（${task.label}）依赖 ${dependencies}，输出 ${task.contract.outputTable}；任务标识与运行记录一致。`,
  }
}

function createMetricEvidence(): LineageEvidence {
  return {
    source: 'metric_definition',
    detail: '指标定义证据：该对象被存款余额指标口径引用；它说明消费关系，不自动证明业务因果。',
  }
}

function createManualEvidence(edge: LineageEdge, nodes: readonly LineageNode[]): LineageEvidence {
  const source = nodes.find((node) => node.id === edge.source)?.label ?? edge.source
  const target = nodes.find((node) => node.id === edge.target)?.label ?? edge.target

  return {
    source: 'manual_metadata',
    detail: `教学扩展关系：${source} → ${target} 的来源与责任尚未自动登记；保留它用于解释账户画像分支，变更前需要回到元数据和业务语义确认。`,
  }
}

function getTaskNodeIdForGraph(taskId: string, nodes: readonly LineageNode[]): string | undefined {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const candidateMaps = [
    LINEAGE_TASK_NODE_IDS,
    LEGACY_BANKING_LINEAGE_TASK_NODE_IDS,
    LEGACY_ECOMMERCE_LINEAGE_TASK_NODE_IDS,
  ]

  for (const candidateMap of candidateMaps) {
    const nodeId = candidateMap[taskId]
    if (nodeId && nodeIds.has(nodeId)) {
      return nodeId
    }
  }

  return undefined
}

function bindNodes(
  nodes: readonly LineageNode[],
  schedulerTasks: readonly SchedulerTaskDefinition[],
): LineageProductionNode[] {
  return nodes.map((node) => {
    const taskId = Object.keys(LINEAGE_TASK_NODE_IDS).find(
      (candidateTaskId) => getTaskNodeIdForGraph(candidateTaskId, nodes) === node.id,
    )
    if (taskId) {
      const task = getTask(schedulerTasks, taskId)
      return {
        ...node,
        role: `${node.role} · ${task.taskId}`,
        schedulerTaskId: task.taskId,
      }
    }

    if (node.id === 'task-build-account-profile') {
      return {
        ...node,
        role: `${node.role} · 需人工核对来源与责任`,
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
      schedulerTaskId: schedulerTask?.taskId,
      transformationStepId: binding?.stepId,
    }
  })
}

function createFieldSemanticChangeEvent(): LineageInvestigationEventDefinition {
  return {
    id: 'investigate-deposit-balance-semantic-change',
    entryPoint: 'field-semantic-change',
    label: '余额指标语义变化',
    summary: 'DWD.deposit_balance 的“快照日余额”口径发生变化。',
    sourceEntityId: 'field-dwd-balance',
    eventType: 'field_change',
    affectedEntityId: 'metric-deposit-balance',
    evidence: {
      source: 'manual_metadata',
      detail:
        '变更请求证据：余额字段的业务含义被重新定义；先沿 SQL 和 Scheduler 生产路径验证受影响指标。',
    },
  }
}

function createSchemaChangeEvent(): LineageInvestigationEventDefinition {
  return {
    id: 'investigate-deposit-balance-schema-change',
    entryPoint: 'schema-change',
    label: 'schema / field change',
    summary: 'currency 或 balance 字段的类型或编码契约准备变化，需要检查下游分组和指标。',
    sourceEntityId: 'field-dwd-balance',
    eventType: 'field_change',
    affectedEntityId: 'field-ads-balance',
    evidence: {
      source: 'manual_metadata',
      detail:
        'schema change 证据：字段契约变更尚未由 schema registry 自动采集；当前先用字段级路径定位需要复核的对象。',
    },
  }
}

function createTaskFailureEvent(
  scheduler: SchedulerVisualization,
  baseNodes: readonly LineageNode[],
): LineageInvestigationEventDefinition {
  const failedTask = getTask(scheduler.tasks, SCHEDULER_TASK_IDS.dwd)
  const taskId = failedTask.taskId
  const timeline = buildSchedulerTimeline(
    createInitialSchedulerRun(scheduler.tasks, {
      businessDate: scheduler.targetDate,
      scenario: 'dwd-blocked',
      failureTaskId: taskId,
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
    sourceEntityId: getTaskNodeIdForGraph(taskId, baseNodes) ?? taskId,
    eventType: 'task_failure',
    affectedEntityId: 'metric-deposit-report',
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
  const transformationContract = input.transformation.taskContract
  const schedulerContract = input.scheduler.taskContract
  const reusesTransformationContract =
    adsTask.contract.taskId === transformationContract.taskId &&
    adsTask.contract.outputTable === transformationContract.outputTable
  const sharesBusinessPartition =
    schedulerContract.businessDate === transformationContract.businessDate &&
    schedulerContract.partition.column === transformationContract.partition.column &&
    schedulerContract.partition.value === transformationContract.partition.value
  const isLayeredBankingContract =
    sharesBusinessPartition && adsTask.contract.dependencies.includes(schedulerContract.outputTable)
  const isLegacyOutputAlias =
    sharesBusinessPartition && adsTask.contract.outputTable === 'ads_yesterday_sales'

  if (!reusesTransformationContract && !isLayeredBankingContract && !isLegacyOutputAlias) {
    throw new Error(
      `Scheduler ADS task 没有复用兼容的 SQL task contract: ${adsTask.taskId} !== ${transformationContract.taskId}`,
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
      createTaskFailureEvent(input.scheduler, input.baseNodes),
    ],
  }
}
