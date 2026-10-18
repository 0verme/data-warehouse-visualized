import { scanLayoutData } from '../performance/banking'
import type { PerformanceScanMode } from '../performance/types'
import { getScanSnapshot } from '../../utils/performance'

export type PartitionPredicateShape = 'typed-range' | 'wrapped-key'

export interface PartitionPruningSnapshot {
  shape: PartitionPredicateShape
  totalPartitions: number
  scannedPartitions: number
  skippedPartitions: number
  scanBytes: string
  fileCount: number
}

const FIXTURE_MODE_BY_SHAPE: Record<PartitionPredicateShape, PerformanceScanMode> = {
  'typed-range': 'partition-pruning',
  'wrapped-key': 'full-history',
}

const fullHistory = getScanSnapshot(scanLayoutData, 'full-history')

/**
 * Present the existing scan-layout teaching fixture in an English, predicate-focused view.
 * The mapping is an illustrative contrast, not a model of any database optimizer.
 */
export function getPartitionPruningSnapshot(
  shape: PartitionPredicateShape,
): PartitionPruningSnapshot {
  const scan = getScanSnapshot(scanLayoutData, FIXTURE_MODE_BY_SHAPE[shape])

  return {
    shape,
    totalPartitions: fullHistory.partitionsTouched,
    scannedPartitions: scan.partitionsTouched,
    skippedPartitions: fullHistory.partitionsTouched - scan.partitionsTouched,
    scanBytes: scan.scanBytes,
    fileCount: scan.fileCount,
  }
}
