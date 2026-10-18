import { lakehouseVisualizations } from '../../content/lessons/lakehouse'
import type { LakehouseSnapshot, LakehouseSnapshotPointerState } from '../../types'
import {
  commitSnapshot,
  getAtomicCommitState,
  getSnapshotPointerState,
} from '../../utils/lakehouse'
import type {
  EnglishLakehouseFixture,
  EnglishLakehouseScenario,
  EnglishLakehouseSnapshot,
} from './types'

function projectSnapshot(snapshot: LakehouseSnapshot): EnglishLakehouseSnapshot {
  return {
    version: snapshot.version,
    id: snapshot.id,
    committedAt: snapshot.committedAt,
    columns: [...snapshot.columns],
    rows: snapshot.rows.map((row) =>
      Object.fromEntries(snapshot.columns.map((column) => [column, row[column] ?? null])),
    ),
  }
}

function projectScenario(
  id: EnglishLakehouseScenario['id'],
  pointer: LakehouseSnapshotPointerState,
  fileBatch: EnglishLakehouseScenario['fileBatch'],
): EnglishLakehouseScenario {
  return {
    id,
    publishedVersion: pointer.publishedVersion,
    queryTargetVersion: pointer.queryTargetVersion,
    readerVersion: pointer.readerVersion,
    metadataStatus: pointer.metadataStatus,
    pointerMoved: pointer.pointerMoved,
    fileBatch,
  }
}

/**
 * Read the existing Chinese lesson fixture at build time and expose only its small,
 * serializable English data projection to the English article and client island.
 */
export function buildEnglishLakehouseFixture(): EnglishLakehouseFixture {
  const visualization = lakehouseVisualizations.tableLayer
  const initialSnapshot = visualization.snapshots[0]

  if (!initialSnapshot) {
    throw new Error('The lakehouse table-layer lesson is missing its initial snapshot.')
  }

  const { tableLayer, evolutionCommit } = visualization
  const failedCommit = getAtomicCommitState(tableLayer.fileCount, tableLayer.failureAt, 'failed')
  const committedCommit = getAtomicCommitState(
    tableLayer.fileCount,
    tableLayer.failureAt,
    'committed',
  )
  const committedSnapshots = commitSnapshot(visualization.snapshots, evolutionCommit)
  const committedSnapshot = committedSnapshots.find((snapshot) => snapshot.version === 2)

  if (!committedSnapshot) {
    throw new Error('The lakehouse table-layer lesson is missing its committed v2 snapshot.')
  }

  const failedPointer = getSnapshotPointerState(
    visualization.snapshots,
    initialSnapshot.version,
    failedCommit,
  )
  const committedPointer = getSnapshotPointerState(
    committedSnapshots,
    committedSnapshot.version,
    committedCommit,
  )
  const timeTravelPointer = getSnapshotPointerState(
    committedSnapshots,
    initialSnapshot.version,
    committedCommit,
  )

  return {
    tableName: tableLayer.tableName,
    fileCount: tableLayer.fileCount,
    failureAt: tableLayer.failureAt,
    formatExamples: [...tableLayer.openTableFormats],
    snapshots: committedSnapshots.map(projectSnapshot),
    scenarios: {
      failed: projectScenario('failed', failedPointer, {
        attempted: failedCommit.fileCount,
        written: failedCommit.writtenFileCount,
        committed: failedCommit.committedFileCount,
      }),
      committed: projectScenario('committed', committedPointer, {
        attempted: committedCommit.fileCount,
        written: committedCommit.writtenFileCount,
        committed: committedCommit.committedFileCount,
      }),
      'time-travel': projectScenario('time-travel', timeTravelPointer, {
        attempted: committedCommit.fileCount,
        written: committedCommit.writtenFileCount,
        committed: committedCommit.committedFileCount,
      }),
    },
  }
}
