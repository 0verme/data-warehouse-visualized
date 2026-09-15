import type {
  LakehouseArchitecture,
  LakehouseArchitectureState,
  LakehouseDataVolumeCategory,
  LakehouseWorkload,
} from '../../types'

export type PerformanceDataVolume = number
export type PerformanceJoinStrategy = 'broadcast' | 'shuffle'
export type PerformanceAggregationStrategy = 'single-stage' | 'two-phase'
export type PerformanceProcessingMode = 'full' | 'incremental'
export type PerformanceReuseMode = 'none' | 'materialized'

export type PerformanceArchitectureInput = Pick<
  LakehouseArchitectureState,
  'architecture' | 'workload' | 'dataVolumeCategory'
>

export interface PerformanceConfig {
  /** Data volume in millions of rows; it is a simulation input, not a benchmark claim. */
  dataVolume: PerformanceDataVolume
  partitionCount: number
  partitionFilterSelectivity: number
  hotKeyRatio: number
  fileFragmentation: number
  workerCount: number
  partitionPruning: boolean
  layoutAdjustment: boolean
  joinStrategy: PerformanceJoinStrategy
  aggregationStrategy: PerformanceAggregationStrategy
  processingMode: PerformanceProcessingMode
  reuseMode: PerformanceReuseMode
}

export interface PerformanceVisualization {
  kind: 'performance-lab'
  architecture: PerformanceArchitectureInput
  defaults?: Partial<PerformanceConfig>
}

export interface PerformanceStageEstimate {
  stage: 'scan' | 'join' | 'shuffle' | 'aggregate' | 'write'
  label: string
  relativeWork: number
}

export interface PerformanceMetrics {
  basis: 'simulation / relative estimate'
  totalRows: number
  scannedRows: number
  scannedBlocks: number
  partitionsTouched: number
  shuffleVolume: number
  longestWorker: number
  longestStage: PerformanceStageEstimate['stage']
  relativeRuntime: number
  relativeCost: number
  writeCost: number
  storageImpact: number
  freshnessImpact: number
  workerLoads: readonly number[]
  stages: readonly PerformanceStageEstimate[]
  tradeoffs: readonly string[]
}

export interface PerformanceComparison {
  before: PerformanceMetrics
  after: PerformanceMetrics
  changes: {
    scannedRows: number
    scannedBlocks: number
    partitionsTouched: number
    shuffleVolume: number
    longestWorker: number
    relativeRuntime: number
    relativeCost: number
    writeCost: number
    storageImpact: number
    freshnessImpact: number
  }
}

export interface PerformanceArchitectureMapping {
  architecture: LakehouseArchitecture
  workload: LakehouseWorkload
  dataVolumeCategory: LakehouseDataVolumeCategory
  computeSeparation: LakehouseArchitectureState['computeSeparation']
  storageType: string
  partitionFileLayoutHint: string
  pruningMultiplier: number
  writeMultiplier: number
  workloadMultiplier: number
  dataVolumeMultiplier: number
}
