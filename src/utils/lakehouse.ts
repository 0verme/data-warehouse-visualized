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
  LakehouseSnapshotPointerState,
  LakehouseUnityConfig,
  LakehouseUnityMode,
  LakehouseUnityState,
  LakehouseVisibilityStep,
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
      writtenFileCount: failureAt - 1,
      committedFileCount: 0,
      visibleFileCount: 0,
      message: `第 ${failureAt} 个文件写入失败；前 ${failureAt - 1} 个文件已写入但未提交，读者继续看到旧 Snapshot。`,
    }
  }

  if (status === 'committed') {
    return {
      status,
      fileCount,
      failureAt,
      writtenFileCount: fileCount,
      committedFileCount: fileCount,
      visibleFileCount: fileCount,
      message: `${fileCount} 个文件一起提交，读者看到完整的新 Table State。`,
    }
  }

  return {
    status,
    fileCount,
    failureAt,
    writtenFileCount: 0,
    committedFileCount: 0,
    visibleFileCount: 0,
    message: `准备提交 ${fileCount} 个文件；第 ${failureAt} 个文件是故障演示位置。`,
  }
}

/**
 * 把 Atomic Commit 的结果翻译成「谁让新版本可见」的因果链。
 * published* 只来自已提交的 snapshots；queryTargetVersion 是一次读取的目标，
 * 二者分离，Time Travel 不会改写正式发布状态。
 */
export function getSnapshotPointerState(
  snapshots: readonly LakehouseSnapshot[],
  queryTargetVersion: number,
  commitState: LakehouseAtomicCommitState,
): LakehouseSnapshotPointerState {
  const published = getLatestSnapshot(snapshots)

  if (!published) {
    throw new RangeError('Snapshot Pointer 需要一个已提交的初始版本')
  }

  const previousPublishedVersion =
    snapshots.reduce<number | null>(
      (previous, snapshot) =>
        snapshot.version < published.version && (previous === null || snapshot.version > previous)
          ? snapshot.version
          : previous,
      null,
    ) ?? null

  const queryTarget = timeTravelTo(snapshots, queryTargetVersion) ?? published
  const queryTargetIsPublished = queryTarget.version === published.version
  const metadataCommitted = commitState.status === 'committed'
  const metadataVersion = metadataCommitted ? published.version : published.version + 1
  const metadataStatus = metadataCommitted
    ? 'committed'
    : commitState.status === 'failed'
      ? 'uncommitted'
      : 'not-started'
  const pointerMoved = metadataCommitted

  type StepContent = Pick<LakehouseVisibilityStep, 'state' | 'value' | 'detail'>

  const filesStep: StepContent =
    commitState.status === 'failed'
      ? {
          state: 'pending',
          value: `已写入 ${commitState.writtenFileCount} / ${commitState.fileCount} 个文件`,
          detail: `第 ${commitState.failureAt} 个文件写入失败；已写入的文件没有被任何已提交 Snapshot 引用。`,
        }
      : metadataCommitted
        ? {
            state: 'committed',
            value: `已写入 ${commitState.writtenFileCount} / ${commitState.fileCount} 个文件`,
            detail: '整批文件一起写入并与 Metadata 一起提交；读者不会看到半批更新。',
          }
        : {
            state: 'empty',
            value: '尚未写入文件',
            detail: `本次更新准备写入 ${commitState.fileCount} 个文件，还没有文件落盘。`,
          }

  const metadataStep: StepContent = metadataCommitted
    ? {
        state: 'committed',
        value: `v${metadataVersion} Snapshot 已提交`,
        detail: 'Metadata 记录这一批文件属于新的 Table State，历史中多了一个可定位版本。',
      }
    : metadataStatus === 'uncommitted'
      ? {
          state: 'pending',
          value: `v${metadataVersion} Snapshot 未提交`,
          detail: 'Commit 未完成，Metadata 不产生新 Snapshot；已写入文件不属于任何正式版本。',
        }
      : {
          state: 'empty',
          value: `v${metadataVersion} 尚未开始`,
          detail: '还没有文件批次，Metadata 没有需要记录的新 Snapshot。',
        }

  const pointerStep: StepContent = pointerMoved
    ? {
        state: 'committed',
        value:
          previousPublishedVersion === null
            ? `v${published.version}`
            : `v${previousPublishedVersion} → v${published.version}`,
        detail: '发布指针只跟随已提交 Snapshot；移动后读者默认读取新的 Table State。',
      }
    : {
        state: 'unchanged',
        value: `仍为 v${published.version}`,
        detail:
          metadataStatus === 'uncommitted'
            ? '发布指针只跟随已提交 Snapshot，不跟随已写入文件，因此没有移动。'
            : '没有新的已提交 Snapshot，发布指针保持不动。',
      }

  const readerStep: StepContent = queryTargetIsPublished
    ? metadataCommitted
      ? {
          state: 'committed',
          value: `读取 v${queryTarget.version}`,
          detail: '查询目标跟随发布指针，读到完整的新 Table State。',
        }
      : {
          state: 'unchanged',
          value: `仍读取 v${queryTarget.version}`,
          detail:
            metadataStatus === 'uncommitted'
              ? '半成品文件不在任何已提交 Snapshot 中，因此读者看不到它们。'
              : '查询目标等于发布指针，读取当前唯一已提交版本。',
        }
    : {
        state: 'time-travel',
        value: `本次查询读取 v${queryTarget.version}`,
        detail: `Query Target = v${queryTarget.version}；Current Published Pointer 仍为 v${published.version}，没有被改回。`,
      }

  const visibilitySteps: LakehouseSnapshotPointerState['visibilitySteps'] = [
    { id: 'files', label: 'Immutable Data Files', ...filesStep },
    { id: 'metadata', label: 'Metadata / Snapshot', ...metadataStep },
    { id: 'pointer', label: 'Published Pointer', ...pointerStep },
    { id: 'reader', label: 'Reader Visibility', ...readerStep },
  ]

  const summary = !queryTargetIsPublished
    ? `本次查询 Time Travel 到 v${queryTarget.version}；Current Published Pointer 仍为 v${published.version}。`
    : metadataCommitted
      ? `Commit 成功：Published Pointer ${previousPublishedVersion === null ? '' : `v${previousPublishedVersion} → `}v${published.version}，读者看到 v${published.version}。`
      : metadataStatus === 'uncommitted'
        ? `Commit 失败：v${metadataVersion} 没有形成 Snapshot，Published Pointer 仍为 v${published.version}，读者仍看到 v${published.version}。`
        : `尚未提交：Published Pointer 为 v${published.version}，读者看到 v${published.version}。`

  return {
    publishedVersion: published.version,
    publishedSnapshotId: published.id,
    publishedCommittedAt: published.committedAt,
    previousPublishedVersion,
    pointerMoved,
    queryTargetVersion: queryTarget.version,
    queryTargetSnapshotId: queryTarget.id,
    queryTargetIsPublished,
    readerVersion: queryTarget.version,
    metadataStatus,
    metadataVersion,
    visibilitySteps,
    summary,
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
