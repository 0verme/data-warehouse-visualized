import { sqlTransformationLayersContent } from '../../content/lessons/sql-and-transformation-layers'
import type { SqlTransformationVisualization } from '../sql-transformation/types'
import { getTransformationStepResult } from '../../utils/sql-transformation'

export interface EtlEltFixture {
  snapshotDate: string
  rawRows: number
  standardizedRows: number
  groupedRows: number
  publishedRows: number
  publishedAmount: number
}

function getTransformationVisualization(): SqlTransformationVisualization {
  const section = sqlTransformationLayersContent.sections.find(
    (candidate) =>
      candidate.kind === 'visualization' && candidate.visualization.kind === 'sql-transformation',
  )

  if (
    !section ||
    section.kind !== 'visualization' ||
    section.visualization.kind !== 'sql-transformation'
  ) {
    throw new Error('The SQL transformation lesson is missing its fixed balance snapshot.')
  }

  return section.visualization
}

/**
 * Read the existing transformation lesson fixture on the server and project only the small,
 * deterministic English example consumed by the page and its client island.
 */
export function buildEtlEltFixture(): EtlEltFixture {
  const visualization = getTransformationVisualization()
  const clean = getTransformationStepResult(visualization.dataset, 'clean-detail')
  const aggregate = getTransformationStepResult(visualization.dataset, 'aggregate-layers')
  const publication = getTransformationStepResult(visualization.dataset, 'contract')

  return {
    snapshotDate: visualization.targetDate,
    rawRows: clean.inputMetrics.rowCount,
    standardizedRows: clean.outputMetrics.rowCount,
    groupedRows: aggregate.outputMetrics.rowCount,
    publishedRows: publication.outputMetrics.rowCount,
    publishedAmount: publication.outputMetrics.amount,
  }
}
