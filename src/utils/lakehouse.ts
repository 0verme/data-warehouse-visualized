import type {
  LakehouseArchitecture,
  LakehouseArchitectureState,
  LakehouseAtomicCommitState,
  LakehouseAtomicCommitStatus,
  LakehouseDataSource,
  LakehouseLakeFirstAssessment,
  LakehouseLakeFirstAssessmentItem,
  LakehouseLakeFirstVisualization,
  LakehouseReplicationConfig,
  LakehouseReplicationState,
  LakehouseRow,
  LakehouseSchemaField,
  LakehouseSnapshot,
  LakehouseSnapshotCommit,
  LakehouseUnityConfig,
  LakehouseUnityMode,
  LakehouseUnityState,
  LakehouseWorkload,
} from '../types'

export const LAKEHOUSE_ARCHITECTURES: readonly LakehouseArchitecture[] = [
  'warehouse',
  'lake',
  'lakehouse',
]

export const LAKEHOUSE_ARCHITECTURE_OPTIONS: readonly {
  id: LakehouseArchitecture
  label: string
  detail: string
}[] = [
  {
    id: 'warehouse',
    label: 'Warehouse',
    detail: '受管理的分析表，适合稳定的结构化查询。',
  },
  {
    id: 'lake',
    label: 'Data Lake',
    detail: '开放存储，先承接多种原始数据。',
  },
  {
    id: 'lakehouse',
    label: 'Lakehouse',
    detail: '开放存储加上可管理的表语义。',
  },
]

const ARCHITECTURE_STATES: Record<
  LakehouseArchitecture,
  Omit<LakehouseArchitectureState, 'architecture' | 'workload' | 'dataVolumeCategory'>
> = {
  warehouse: {
    storageType: '受管理的表存储',
    computeSeparation: 'partial',
    partitionFileLayoutHint: '按日期 / 主题分区，优先维护稳定的表与索引契约。',
  },
  lake: {
    storageType: '对象存储文件',
    computeSeparation: 'separated',
    partitionFileLayoutHint: '按来源 / 日期组织目录；需要自己控制小文件、分区和 schema。',
  },
  lakehouse: {
    storageType: '对象存储 + 开放表格式',
    computeSeparation: 'separated',
    partitionFileLayoutHint: '开放表管理分区与文件布局；仍需治理小文件、压缩和元数据成本。',
  },
}

/**
 * Provides the small architecture context consumed by the later performance lesson.
 * It describes a runtime boundary; it does not rank or recommend an architecture.
 */
export function getArchitectureState(
  architecture: LakehouseArchitecture,
  workload: LakehouseWorkload,
  dataVolumeCategory: LakehouseArchitectureState['dataVolumeCategory'],
): LakehouseArchitectureState {
  return {
    architecture,
    workload,
    dataVolumeCategory,
    ...ARCHITECTURE_STATES[architecture],
  }
}

export function getLakeFirstAssessment(
  sources: readonly LakehouseDataSource[],
  config: LakehouseLakeFirstVisualization,
  demandId: LakehouseLakeFirstVisualization['defaultDemandId'],
): LakehouseLakeFirstAssessment {
  const demand = config.demands.find((candidate) => candidate.id === demandId)

  if (!demand) {
    throw new RangeError(`Unknown Lake-first demand: ${demandId}`)
  }

  const warehouseSourceIds = new Set(demand.warehouseSourceIds)
  const items: LakehouseLakeFirstAssessmentItem[] = sources.map((source) => ({
    sourceId: source.id,
    status: warehouseSourceIds.has(source.id) ? 'lake-and-warehouse' : 'lake-only',
    reason: warehouseSourceIds.has(source.id) ? demand.warehouseReason : demand.lakeOnlyReason,
  }))
  const warehouseCount = items.filter((item) => item.status === 'lake-and-warehouse').length

  return {
    demand,
    items,
    warehouseCount,
    summary:
      warehouseCount === 0
        ? '当前需求先保留在 Lake；没有足够的访问或服务压力要求建立 Warehouse 副本。'
        : `${warehouseCount} 类数据进入 Warehouse 服务层，其余数据继续由 Lake 承载。`,
  }
}

export function getReplicationState(
  config: LakehouseReplicationConfig,
  isSynced: boolean,
): LakehouseReplicationState {
  return {
    syncStatus: isSynced ? 'synced' : 'pending',
    replicaCount: isSynced ? 2 : 1,
    lakeVersion: config.dataset.version,
    warehouseVersion: isSynced ? config.warehouseVersion : null,
    lakeSchema: [...config.dataset.schema],
    warehouseSchema: isSynced ? [...config.warehouseSchema] : null,
    syncDelay: isSynced ? config.syncDuration : '尚未执行同步',
    responsibilities: [...config.responsibilities],
  }
}

export function getAtomicCommitState(
  fileCount: number,
  failureAt: number,
  status: LakehouseAtomicCommitStatus,
): LakehouseAtomicCommitState {
  if (!Number.isInteger(fileCount) || fileCount < 1) {
    throw new RangeError('Atomic Commit 的文件数量必须是正整数')
  }

  if (!Number.isInteger(failureAt) || failureAt < 1 || failureAt > fileCount) {
    throw new RangeError('Atomic Commit 的失败位置必须落在文件批次内')
  }

  if (status === 'failed') {
    return {
      status,
      fileCount,
      failureAt,
      visibleFileCount: 0,
      message: `第 ${failureAt} 个文件写入失败；前 ${failureAt - 1} 个文件保持待发布，读者继续看到旧 Snapshot。`,
    }
  }

  if (status === 'committed') {
    return {
      status,
      fileCount,
      failureAt,
      visibleFileCount: fileCount,
      message: `${fileCount} 个文件一起提交，读者看到完整的新 Table State。`,
    }
  }

  return {
    status,
    fileCount,
    failureAt,
    visibleFileCount: 0,
    message: `准备提交 ${fileCount} 个文件；第 ${failureAt} 个文件是故障演示位置。`,
  }
}

export function getLakehouseUnityState(
  config: LakehouseUnityConfig,
  mode: LakehouseUnityMode,
): LakehouseUnityState {
  return {
    mode,
    modeLabel: mode === 'heterogeneous' ? '异构湖仓' : '共享基础能力的形态',
    replicaCount: mode === 'heterogeneous' ? 2 : 1,
    dimensions: config.dimensions.map((dimension) => ({
      ...dimension,
      value: mode === 'heterogeneous' ? dimension.heterogeneous : dimension.sharedTable,
    })),
    responsibilities: [...config.responsibilities[mode]],
  }
}

export function getLatestSnapshot(
  snapshots: readonly LakehouseSnapshot[],
): LakehouseSnapshot | undefined {
  return snapshots.reduce<LakehouseSnapshot | undefined>(
    (latest, snapshot) => (!latest || snapshot.version > latest.version ? snapshot : latest),
    undefined,
  )
}

function normalizeRows(columns: readonly string[], rows: readonly LakehouseRow[]): LakehouseRow[] {
  return rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column, row[column] ?? null])),
  )
}

export function evolveSnapshotSchema(
  snapshot: LakehouseSnapshot,
  addedFields: readonly LakehouseSchemaField[],
): LakehouseSnapshot {
  const newFields = addedFields.filter((field) => !snapshot.columns.includes(field.name))
  const columns = [...snapshot.columns, ...newFields.map((field) => field.name)]
  const defaults = new Map(newFields.map((field) => [field.name, field.defaultValue]))
  const rows = snapshot.rows.map((row) => ({
    ...row,
    ...Object.fromEntries(newFields.map((field) => [field.name, defaults.get(field.name) ?? null])),
  }))

  return { ...snapshot, columns, rows: normalizeRows(columns, rows) }
}

/**
 * Commits one complete snapshot. The function only returns the new state after a successful
 * operation, so callers can model a failed file batch without exposing a partial snapshot.
 */
export function commitSnapshot(
  snapshots: readonly LakehouseSnapshot[],
  commit: LakehouseSnapshotCommit,
): LakehouseSnapshot[] {
  const current = getLatestSnapshot(snapshots)

  if (!current) {
    throw new RangeError('提交 snapshot 需要一个初始版本')
  }

  const evolved = evolveSnapshotSchema(current, commit.addedFields ?? [])
  const nextVersion = current.version + 1
  const nextRows = normalizeRows(evolved.columns, commit.rows ?? [])
  const nextSnapshot: LakehouseSnapshot = {
    version: nextVersion,
    id: `snapshot-${nextVersion}`,
    committedAt: commit.committedAt,
    columns: evolved.columns,
    rows: [...evolved.rows, ...nextRows],
    change: commit.change,
  }

  return [...snapshots, nextSnapshot]
}

export function timeTravelTo(
  snapshots: readonly LakehouseSnapshot[],
  version: number,
): LakehouseSnapshot | undefined {
  return snapshots.find((snapshot) => snapshot.version === version)
}
