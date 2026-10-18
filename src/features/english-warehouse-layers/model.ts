import { sqlTransformationLayersContent } from '../../content/lessons/sql-and-transformation-layers'
import { warehouseLayersContent } from '../../content/lessons/warehouse-layers'
import type { SqlTransformationVisualization } from '../sql-transformation/types'
import type {
  LayerEvolutionVisualization,
  LayerEvolutionDemand,
  LayerEvolutionSource,
  LayerEvolutionStage,
} from '../../types'
import { getTransformationStepResult } from '../../utils/sql-transformation'

export type WarehouseLayerDemandId = 'one-consumer' | 'two-consumers' | 'many-consumers'

export interface WarehouseLayerSourceView {
  id: string
  label: string
  detail: string
}

export interface WarehouseLayerConsumerView {
  id: string
  label: string
}

export interface WarehouseLayerStageView {
  id: string
  role: string
  title: string
  detail: string
  output: string
}

export interface WarehouseLayerPlanView {
  id: WarehouseLayerDemandId
  label: string
  title: string
  note: string
  architecture: 'direct' | 'shared'
  consumers: readonly WarehouseLayerConsumerView[]
  sourceSystems: readonly WarehouseLayerSourceView[]
  repeatedResponsibilities: readonly string[]
  repeatedWorkSlots: number
  sharedStages: readonly WarehouseLayerStageView[]
}

export interface WarehouseLayersDecisionModel {
  plans: readonly WarehouseLayerPlanView[]
  fixedExample: {
    snapshotDate: string
    sourceRows: number
    standardizedDetailRows: number
    groupedRows: number
    publishedMetricRows: number
    publishedMetricAmount: number
  }
}

const planCopy: Record<WarehouseLayerDemandId, { label: string; title: string; note: string }> = {
  'one-consumer': {
    label: 'One consumer',
    title: 'A direct path can be enough',
    note: 'One report does not automatically need a separate shared layer. Keep the path simple until a distinct responsibility or consumer justifies a boundary.',
  },
  'two-consumers': {
    label: 'Two consumers',
    title: 'The same responsibilities are repeated',
    note: 'Both consumers perform the same three work items in this fixture. A shared boundary may help if the logic and ownership are genuinely common.',
  },
  'many-consumers': {
    label: 'Several consumers',
    title: 'Shared responsibilities feed different outputs',
    note: 'Four consumers reuse one staging-to-core-to-mart path here. The diagram counts responsibility slots, not runtime, latency, or guaranteed savings.',
  },
}

const sourceCopy: Record<string, Omit<WarehouseLayerSourceView, 'id'>> = {
  'core-banking': { label: 'Core banking', detail: 'Deposit balance snapshots' },
  'credit-system': { label: 'Credit system', detail: 'Loan balance snapshots' },
}

const consumerCopy: Record<string, string> = {
  'ratio-report': 'Loan-to-deposit report',
  'ratio-daily': 'Daily ratio report',
  'branch-report': 'Branch operations report',
  'management-dashboard': 'Management dashboard',
  'metrics-api': 'Metrics API',
}

const stageCopy: Record<string, Omit<WarehouseLayerStageView, 'id' | 'output'>> = {
  'raw-data': {
    role: 'Staging',
    title: 'Keep source context inspectable',
    detail: 'Land the source records with enough context to explain what arrived.',
  },
  'standardized-data': {
    role: 'Core',
    title: 'Make shared detail consistent',
    detail: 'Align common identifiers and fields before multiple consumers apply their own rules.',
  },
  'shared-data': {
    role: 'Mart',
    title: 'Publish a reusable business result',
    detail: 'Expose the branch-level measure that several downstream products need.',
  },
}

const repeatedResponsibilities = [
  'Read the source snapshots',
  'Align branch identifiers',
  'Apply the same ratio definition',
] as const

function getLayerEvolutionVisualization(): LayerEvolutionVisualization {
  const section = warehouseLayersContent.sections.find(
    (candidate) =>
      candidate.kind === 'visualization' && candidate.visualization.kind === 'layer-evolution',
  )

  if (
    !section ||
    section.kind !== 'visualization' ||
    section.visualization.kind !== 'layer-evolution'
  ) {
    throw new Error('The warehouse-layers teaching fixture is missing its layer-evolution data.')
  }

  return section.visualization
}

function getSqlTransformationVisualization(): SqlTransformationVisualization {
  const section = sqlTransformationLayersContent.sections.find(
    (candidate) =>
      candidate.kind === 'visualization' && candidate.visualization.kind === 'sql-transformation',
  )

  if (
    !section ||
    section.kind !== 'visualization' ||
    section.visualization.kind !== 'sql-transformation'
  ) {
    throw new Error('The SQL transformation lesson is missing its layer snapshot data.')
  }

  return section.visualization
}

function mapSource(source: LayerEvolutionSource): WarehouseLayerSourceView {
  const copy = sourceCopy[source.id]
  if (!copy) throw new Error(`Unknown warehouse layer source: ${source.id}`)
  return { id: source.id, ...copy }
}

function mapStage(stage: LayerEvolutionStage): WarehouseLayerStageView {
  const copy = stageCopy[stage.id]
  if (!copy) throw new Error(`Unknown warehouse layer stage: ${stage.id}`)
  return { id: stage.id, ...copy, output: stage.output }
}

function mapConsumer(id: string): WarehouseLayerConsumerView {
  const label = consumerCopy[id]
  if (!label) throw new Error(`Unknown warehouse layer consumer: ${id}`)
  return { id, label }
}

function mapPlan(
  visualization: LayerEvolutionVisualization,
  id: WarehouseLayerDemandId,
  demand: LayerEvolutionDemand,
): WarehouseLayerPlanView {
  const copy = planCopy[id]
  const consumers = demand.consumers.map(({ id: consumerId }) => mapConsumer(consumerId))
  const workItemCount = demand.repeatedWork.length
  const responsibilities = repeatedResponsibilities.slice(0, workItemCount)

  if (responsibilities.length !== workItemCount) {
    throw new Error(`No English responsibility labels for ${workItemCount} fixture work items.`)
  }

  return {
    id,
    ...copy,
    architecture: demand.architecture,
    consumers,
    sourceSystems: visualization.sources.map(mapSource),
    repeatedResponsibilities: demand.architecture === 'direct' ? responsibilities : [],
    repeatedWorkSlots: demand.architecture === 'direct' ? consumers.length * workItemCount : 0,
    sharedStages: demand.architecture === 'shared' ? visualization.sharedStages.map(mapStage) : [],
  }
}

/**
 * Build an English-only view over the existing lesson fixtures. The lesson data and
 * LayerEvolutionLab/LayerNetworkEvolution remain read-only; this projection does
 * not expose their Chinese presentation strings to the English island.
 */
export function getWarehouseLayersDecisionModel(): WarehouseLayersDecisionModel {
  const layerVisualization = getLayerEvolutionVisualization()
  const plans = (['one-consumer', 'two-consumers', 'many-consumers'] as const).map((id) => {
    const demand = layerVisualization.demands.find((candidate) => candidate.id === id)
    if (!demand) throw new Error(`Missing warehouse layer demand fixture: ${id}`)
    return mapPlan(layerVisualization, id, demand)
  })

  const transformation = getSqlTransformationVisualization()
  const standardization = getTransformationStepResult(transformation.dataset, 'clean-detail')
  const aggregation = getTransformationStepResult(transformation.dataset, 'aggregate-layers')
  const publication = getTransformationStepResult(transformation.dataset, 'contract')

  return {
    plans,
    fixedExample: {
      snapshotDate: transformation.targetDate,
      sourceRows: standardization.inputMetrics.rowCount,
      standardizedDetailRows: standardization.outputMetrics.rowCount,
      groupedRows: aggregation.outputMetrics.rowCount,
      publishedMetricRows: publication.outputMetrics.rowCount,
      publishedMetricAmount: publication.outputMetrics.amount,
    },
  }
}
