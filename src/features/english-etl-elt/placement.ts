import type { EtlEltFixture } from './model'

export type RawRetentionMode = 'retain' | 'discard'
export type TransformPlacementId = 'etl' | 'elt'

export interface TransformPlacementPath {
  id: TransformPlacementId
  label: string
  transformLocation: string
  boundaryRows: number
  boundaryDescription: string
  rawRowsRetained: number
  rawRetentionLocation: string
  replayAvailable: boolean
  replayDescription: string
  steps: readonly string[]
}

export interface EtlEltPlacementModel extends EtlEltFixture {
  retention: RawRetentionMode
  paths: readonly TransformPlacementPath[]
}

/**
 * Project the serializable fixture into the two placement paths. This module has no lesson-data
 * dependency, so the hydrated English island never bundles the source lesson or its Chinese copy.
 */
export function buildEtlEltPlacementModel(
  fixture: EtlEltFixture,
  retention: RawRetentionMode,
): EtlEltPlacementModel {
  const { rawRows, standardizedRows, groupedRows, publishedRows } = fixture
  const rawRowsRetained = retention === 'retain' ? rawRows : 0
  const replayAvailable = retention === 'retain'

  const paths: readonly TransformPlacementPath[] = [
    {
      id: 'etl',
      label: 'ETL · transform before load',
      transformLocation: 'Upstream integration environment, before the warehouse boundary',
      boundaryRows: publishedRows,
      boundaryDescription: 'Curated output rows cross into the warehouse.',
      rawRowsRetained,
      rawRetentionLocation:
        retention === 'retain'
          ? 'Upstream source archive, outside this warehouse load'
          : 'No raw copy retained in this modeled replay scope',
      replayAvailable,
      replayDescription: replayAvailable
        ? `Replay the same fixed ${rawRows}-row extract from the retained upstream archive.`
        : 'The published aggregate alone cannot reconstruct the original source rows.',
      steps: [
        `Read ${rawRows} source snapshots upstream.`,
        `Deduplicate and standardize to ${standardizedRows} detail rows; group to ${groupedRows}.`,
        `Publish ${publishedRows} target row, then load that curated result into the warehouse.`,
      ],
    },
    {
      id: 'elt',
      label: 'ELT · load before transform',
      transformLocation: 'Warehouse compute, after raw rows cross into the landing table',
      boundaryRows: rawRows,
      boundaryDescription: 'Raw source rows cross into the warehouse before transformation.',
      rawRowsRetained,
      rawRetentionLocation:
        retention === 'retain'
          ? 'Warehouse landing table'
          : 'Raw landing rows are not retained after publish in this modeled scope',
      replayAvailable,
      replayDescription: replayAvailable
        ? `Replay the transformation from the retained ${rawRows}-row warehouse landing snapshot.`
        : 'The published aggregate alone cannot reconstruct the original source rows.',
      steps: [
        `Load ${rawRows} source snapshots into the warehouse landing table.`,
        `Transform there: ${rawRows} raw rows → ${standardizedRows} detail → ${groupedRows} groups.`,
        `Publish ${publishedRows} target row from the warehouse transformation.`,
      ],
    },
  ]

  return { ...fixture, retention, paths }
}
