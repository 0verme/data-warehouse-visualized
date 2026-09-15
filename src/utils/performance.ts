import { getArchitectureState } from './lakehouse'
import type { LakehouseArchitectureState } from '../types'
import type {
  PerformanceArchitectureMapping,
  PerformanceComparison,
  PerformanceConfig,
  PerformanceMetrics,
} from '../features/performance/types'

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  dataVolume: 10,
  partitionCount: 100,
  partitionFilterSelectivity: 0.1,
  hotKeyRatio: 0.02,
  fileFragmentation: 0.25,
  workerCount: 8,
  partitionPruning: false,
  layoutAdjustment: false,
  joinStrategy: 'shuffle',
  aggregationStrategy: 'single-stage',
  processingMode: 'full',
  reuseMode: 'none',
}

const ROWS_PER_BLOCK = 100_000
const BYTES_PER_ROW = 160

const WORKLOAD_MULTIPLIERS: Record<LakehouseArchitectureState['workload'], number> = {
  bi: 1,
  exploration: 1.08,
  ml: 1.22,
  streaming: 0.92,
}

const DATA_VOLUME_MULTIPLIERS: Record<LakehouseArchitectureState['dataVolumeCategory'], number> = {
  small: 0.75,
  medium: 1,
  large: 1.35,
}

type NumericConfigKey =
  | 'dataVolume'
  | 'partitionCount'
  | 'partitionFilterSelectivity'
  | 'hotKeyRatio'
  | 'fileFragmentation'
  | 'workerCount'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, isFinite(value) ? value : min))
}

function normalizedConfig(overrides: Partial<PerformanceConfig> = {}): PerformanceConfig {
  const config = { ...DEFAULT_PERFORMANCE_CONFIG, ...overrides }
  const numericRanges: Record<NumericConfigKey, [number, number]> = {
    dataVolume: [0, 1_000],
    partitionCount: [1, 10_000],
    partitionFilterSelectivity: [0, 1],
    hotKeyRatio: [0, 1],
    fileFragmentation: [0, 1],
    workerCount: [1, 256],
  }

  for (const key of Object.keys(numericRanges) as NumericConfigKey[]) {
    const [min, max] = numericRanges[key]
    config[key] = clamp(config[key], min, max)
  }
  config.dataVolume = Math.round(config.dataVolume * 100) / 100
  config.partitionCount = Math.round(config.partitionCount)
  config.workerCount = Math.round(config.workerCount)
  return config
}

/**
 * Converts the existing Chapter 10 state into model modifiers. The state itself
 * remains the source of truth; this function deliberately does not create a
 * second architecture/capability model.
 */
export function mapArchitectureStateToPerformanceInput(
  state: LakehouseArchitectureState,
): PerformanceArchitectureMapping {
  const pruningMultiplier =
    state.architecture === 'lake' ? 1.15 : state.architecture === 'warehouse' ? 0.9 : 1
  const writeMultiplier =
    state.computeSeparation === 'separated' ? 1.2 : state.computeSeparation === 'partial' ? 1.1 : 1

  return {
    architecture: state.architecture,
    workload: state.workload,
    dataVolumeCategory: state.dataVolumeCategory,
    computeSeparation: state.computeSeparation,
    storageType: state.storageType,
    partitionFileLayoutHint: state.partitionFileLayoutHint,
    pruningMultiplier,
    writeMultiplier,
    workloadMultiplier: WORKLOAD_MULTIPLIERS[state.workload],
    dataVolumeMultiplier: DATA_VOLUME_MULTIPLIERS[state.dataVolumeCategory],
  }
}

/** Convenient mapping seam for callers that only have Chapter 10 selections. */
export function getPerformanceArchitectureInput(
  architecture: Parameters<typeof getArchitectureState>[0],
  workload: Parameters<typeof getArchitectureState>[1],
  dataVolumeCategory: Parameters<typeof getArchitectureState>[2],
): PerformanceArchitectureMapping {
  return mapArchitectureStateToPerformanceInput(
    getArchitectureState(architecture, workload, dataVolumeCategory),
  )
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function stage(
  stageId: PerformanceMetrics['longestStage'],
  label: string,
  relativeWork: number,
): { stage: typeof stageId; label: string; relativeWork: number } {
  return { stage: stageId, label, relativeWork: round(relativeWork) }
}

/** Relative model values for comparing performance trade-offs. */
export function simulatePerformance(
  overrides: Partial<PerformanceConfig>,
  architectureState: LakehouseArchitectureState,
): PerformanceMetrics {
  const config = normalizedConfig(overrides)
  const architecture = mapArchitectureStateToPerformanceInput(architectureState)
  const totalRows = Math.round(config.dataVolume * 1_000_000 * architecture.dataVolumeMultiplier)
  const selectedFraction = config.partitionPruning ? config.partitionFilterSelectivity : 1
  const processingFraction = config.processingMode === 'incremental' ? 0.25 : 1
  const reuseFraction = config.reuseMode === 'materialized' ? 0.35 : 1
  const scanFraction = selectedFraction * processingFraction * reuseFraction
  const partitionsTouched =
    selectedFraction === 0
      ? 0
      : config.partitionPruning
        ? Math.min(
            config.partitionCount,
            Math.max(1, Math.ceil(config.partitionCount * selectedFraction)),
          )
        : config.partitionCount
  const scannedRows = Math.round(totalRows * scanFraction)
  const effectiveFragmentation = config.layoutAdjustment
    ? config.fileFragmentation * 0.25
    : config.fileFragmentation
  const scannedBlocks =
    scannedRows === 0
      ? 0
      : Math.ceil((scannedRows / ROWS_PER_BLOCK) * (1 + effectiveFragmentation * 1.5))

  const joinShuffle =
    (config.joinStrategy === 'shuffle' ? scannedRows * BYTES_PER_ROW : scannedRows * 8) *
    architecture.workloadMultiplier
  const aggregateShuffle =
    (config.aggregationStrategy === 'single-stage' ? scannedRows * 72 : scannedRows * 18) *
    architecture.workloadMultiplier
  const shuffleVolume = Math.round((joinShuffle + aggregateShuffle) * reuseFraction)
  const rowsPerWorker = scannedRows / config.workerCount
  const hotRows = scannedRows * config.hotKeyRatio
  const regularRows = (scannedRows - hotRows) / config.workerCount
  const workerLoads = Array.from({ length: config.workerCount }, (_, index) =>
    round(regularRows + (index === 0 ? hotRows : 0)),
  )
  const longestWorker = Math.max(...workerLoads, 0)
  const skewMultiplier = rowsPerWorker > 0 ? longestWorker / rowsPerWorker : 1

  const stages = [
    stage('scan', 'Scan', (scannedBlocks / 10) * architecture.pruningMultiplier),
    stage(
      'join',
      'Join',
      (scannedRows / 1_000_000) *
        (config.joinStrategy === 'broadcast' ? 0.7 : 1) *
        architecture.workloadMultiplier,
    ),
    stage('shuffle', 'Shuffle', shuffleVolume / 100_000_000),
    stage(
      'aggregate',
      'Aggregate',
      (scannedRows / 1_000_000) *
        (config.aggregationStrategy === 'two-phase' ? 0.7 : 1) *
        skewMultiplier *
        architecture.workloadMultiplier,
    ),
    stage(
      'write',
      'Write',
      (scannedRows / 1_000_000) *
        (1 + effectiveFragmentation) *
        architecture.writeMultiplier *
        architecture.workloadMultiplier,
    ),
  ] as const
  const longestStage = stages.reduce((longest, current) =>
    current.relativeWork > longest.relativeWork ? current : longest,
  )
  const totalWork = stages.reduce((sum, current) => sum + current.relativeWork, 0)
  const runtimeWork = totalWork * 0.35 + longestStage.relativeWork
  const baselineWork = Math.max(1, config.dataVolume * 0.1 + config.dataVolume * 4.5)
  const relativeRuntime = round(
    (runtimeWork * (architecture.computeSeparation === 'separated' ? 0.9 : 1)) / baselineWork,
  )
  const compactionCost = config.layoutAdjustment
    ? config.dataVolume * architecture.dataVolumeMultiplier * (0.3 + config.fileFragmentation * 0.3)
    : 0
  const writeCost = round(
    (scannedRows / 1_000_000) *
      (0.12 + effectiveFragmentation * 0.08) *
      architecture.writeMultiplier *
      architecture.workloadMultiplier +
      compactionCost,
  )
  const storageImpact = round(
    (config.fileFragmentation * 0.8 +
      (config.layoutAdjustment ? 0.35 : 0) +
      (config.reuseMode === 'materialized' ? 0.4 : 0)) *
      architecture.dataVolumeMultiplier,
  )
  const relativeCost = round(
    relativeRuntime * (config.reuseMode === 'materialized' ? 1.15 : 1) +
      writeCost / Math.max(1, config.dataVolume * architecture.dataVolumeMultiplier),
  )
  const freshnessImpact = round(
    (config.processingMode === 'incremental' ? 0.18 : 0.05) +
      (config.reuseMode === 'materialized' ? 0.3 : 0) +
      writeCost / Math.max(1, config.dataVolume * 2),
  )
  const tradeoffs: string[] = []
  if (config.layoutAdjustment)
    tradeoffs.push('布局调整减少扫描，但增加 compaction 写入与存储成本。')
  if (config.reuseMode === 'materialized')
    tradeoffs.push('预计算/物化降低查询延迟，但增加存储、写入复杂度和 freshness 延迟。')
  if (config.processingMode === 'incremental')
    tradeoffs.push('增量处理减少本次扫描，但依赖水位、迟到数据和重跑边界。')
  if (config.aggregationStrategy === 'two-phase')
    tradeoffs.push('两阶段聚合减少长尾与 shuffle，但需要额外中间结果。')

  return {
    basis: 'simulation / relative estimate',
    totalRows,
    scannedRows,
    scannedBlocks,
    partitionsTouched,
    shuffleVolume,
    longestWorker,
    longestStage: longestStage.stage,
    relativeRuntime,
    relativeCost,
    writeCost,
    storageImpact,
    freshnessImpact,
    workerLoads,
    stages,
    tradeoffs,
  }
}

export function comparePerformanceStates(
  before: Partial<PerformanceConfig>,
  after: Partial<PerformanceConfig>,
  architectureState: LakehouseArchitectureState,
): PerformanceComparison {
  const beforeMetrics = simulatePerformance(before, architectureState)
  const afterMetrics = simulatePerformance(after, architectureState)
  return {
    before: beforeMetrics,
    after: afterMetrics,
    changes: {
      scannedRows: afterMetrics.scannedRows - beforeMetrics.scannedRows,
      scannedBlocks: afterMetrics.scannedBlocks - beforeMetrics.scannedBlocks,
      partitionsTouched: afterMetrics.partitionsTouched - beforeMetrics.partitionsTouched,
      shuffleVolume: afterMetrics.shuffleVolume - beforeMetrics.shuffleVolume,
      longestWorker: afterMetrics.longestWorker - beforeMetrics.longestWorker,
      relativeRuntime: afterMetrics.relativeRuntime - beforeMetrics.relativeRuntime,
      relativeCost: afterMetrics.relativeCost - beforeMetrics.relativeCost,
      writeCost: afterMetrics.writeCost - beforeMetrics.writeCost,
      storageImpact: afterMetrics.storageImpact - beforeMetrics.storageImpact,
      freshnessImpact: afterMetrics.freshnessImpact - beforeMetrics.freshnessImpact,
    },
  }
}

export const getPerformanceEstimate = simulatePerformance
export const mapArchitectureState = mapArchitectureStateToPerformanceInput
