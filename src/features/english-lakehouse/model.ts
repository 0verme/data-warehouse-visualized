import type {
  EnglishLakehouseFixture,
  EnglishLakehouseScenarioId,
  EnglishLakehouseSnapshot,
} from './types'

export interface EnglishLakehouseScenarioModel {
  id: EnglishLakehouseScenarioId
  title: string
  summary: string
  publishedVersion: number
  queryTargetVersion: number
  fileBatch: {
    attempted: number
    written: number
    committed: number
  }
  fileMessage: string
  metadataMessage: string
  pointerMessage: string
  readerMessage: string
  currentSnapshot: EnglishLakehouseSnapshot
  readerSnapshot: EnglishLakehouseSnapshot
}

/** Selects an English, read-only view of one precomputed table-state scenario. */
export function getEnglishLakehouseScenario(
  fixture: EnglishLakehouseFixture,
  id: EnglishLakehouseScenarioId,
): EnglishLakehouseScenarioModel {
  const scenario = fixture.scenarios[id]
  const currentSnapshot = fixture.snapshots.find(
    (snapshot) => snapshot.version === scenario.publishedVersion,
  )
  const readerSnapshot = fixture.snapshots.find(
    (snapshot) => snapshot.version === scenario.readerVersion,
  )

  if (!currentSnapshot || !readerSnapshot) {
    throw new RangeError(`The lakehouse fixture is missing a snapshot for scenario: ${id}`)
  }

  const isFailed = id === 'failed'
  const isTimeTravel = id === 'time-travel'
  const title = {
    failed: 'A file write fails before the table commit',
    committed: 'The table-level commit publishes v2',
    'time-travel': 'A query reads v1 while v2 remains published',
  }[id]

  return {
    id,
    title,
    summary: isFailed
      ? 'The update does not produce a new committed snapshot in this model, so the reader remains on v1.'
      : isTimeTravel
        ? 'This query targets historical v1; the current published pointer remains at v2.'
        : 'The modeled table-level commit publishes v2, including the new channel field and its sample row.',
    publishedVersion: scenario.publishedVersion,
    queryTargetVersion: scenario.queryTargetVersion,
    fileBatch: { ...scenario.fileBatch },
    fileMessage: isFailed
      ? `${scenario.fileBatch.written} of ${scenario.fileBatch.attempted} files were written before the failure; none are included in a committed snapshot.`
      : `${scenario.fileBatch.committed} of ${scenario.fileBatch.attempted} files in this batch are included in committed v2.`,
    metadataMessage: isFailed
      ? 'No v2 snapshot is committed; the attempted update is not part of the table state.'
      : 'The table metadata records v2 as a committed snapshot with the evolved schema.',
    pointerMessage: isFailed
      ? 'Published pointer: v1; it does not move on this failed attempt.'
      : isTimeTravel
        ? 'Published pointer: v2; selecting an older query target does not move it back.'
        : 'Published pointer: v1 → v2 after the modeled commit.',
    readerMessage: isTimeTravel
      ? 'This read uses v1. The current table state is still v2.'
      : `This read follows the published table state at v${scenario.readerVersion}.`,
    currentSnapshot,
    readerSnapshot,
  }
}
