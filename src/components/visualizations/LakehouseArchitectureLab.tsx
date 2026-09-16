import { useMemo, useState } from 'react'
import type {
  LakehouseAtomicCommitStatus,
  LakehouseDataSource,
  LakehouseDemandId,
  LakehouseLakeFirstAssessmentItem,
  LakehouseReplicationConfig,
  LakehouseSnapshot,
  LakehouseTableLayerConfig,
  LakehouseUnityMode,
  LakehouseVisualization,
  LakehouseRow,
} from '../../types'
import {
  commitSnapshot,
  evolveSnapshotSchema,
  getAtomicCommitState,
  getLakeFirstAssessment,
  getLakehouseUnityState,
  getLatestSnapshot,
  getReplicationState,
  timeTravelTo,
} from '../../utils/lakehouse'

interface LakehouseArchitectureLabProps {
  visualization: LakehouseVisualization
}

const SOURCE_FORMAT_LABELS: Record<LakehouseDataSource['format'], string> = {
  table: 'TABLE',
  'event-log': 'EVENT',
  'json-file': 'FILE',
}

const STATUS_LABELS: Record<LakehouseAtomicCommitStatus, string> = {
  idle: '等待提交',
  failed: '提交失败',
  committed: '整体可见',
}

type FileStatus = 'failed' | 'held' | 'committed' | 'pending'

const FILE_STATUS_LABELS: Record<FileStatus, string> = {
  failed: '失败',
  held: '未发布',
  committed: '已发布',
  pending: '待提交',
}

function getFileStatus(
  batchStatus: LakehouseAtomicCommitStatus,
  fileNumber: number,
  failureAt: number,
): FileStatus {
  if (batchStatus === 'failed') {
    if (fileNumber === failureAt) return 'failed'
    if (fileNumber < failureAt) return 'held'
  }

  return batchStatus === 'committed' ? 'committed' : 'pending'
}

function LabHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="lakehouse-lab__heading">
      <span className="eyebrow eyebrow--small">{eyebrow}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

function SourceCards({ sources }: { sources: readonly LakehouseDataSource[] }) {
  return (
    <div className="lakehouse-source-grid">
      {sources.map((source) => (
        <article className={`lakehouse-source-card is-${source.format}`} key={source.id}>
          <span className="lakehouse-source-card__type">{SOURCE_FORMAT_LABELS[source.format]}</span>
          <strong>{source.label}</strong>
          <code>{source.example}</code>
          <p>{source.detail}</p>
        </article>
      ))}
    </div>
  )
}

function SourceToLake({
  sources,
  detail = '所有输入先落到统一的 Lake 底座。',
}: {
  sources: readonly LakehouseDataSource[]
  detail?: string
}) {
  return (
    <section className="lakehouse-source-flow" aria-labelledby="lakehouse-source-flow-title">
      <div className="lakehouse-lab__subheading">
        <div>
          <span className="eyebrow eyebrow--small">统一入口</span>
          <h4 id="lakehouse-source-flow-title">Source → Lake</h4>
        </div>
        <p>{detail}</p>
      </div>
      <div className="lakehouse-flow-rail" aria-label="所有数据统一进入 Lake">
        <div className="lakehouse-flow-node">
          <span>01</span>
          <strong>Source</strong>
          <small>Transaction · mobile event · partner file</small>
        </div>
        <span className="lakehouse-flow-arrow" aria-hidden="true">
          →
        </span>
        <div className="lakehouse-flow-node is-emphasis">
          <span>02</span>
          <strong>Lake</strong>
          <small>完整历史 · 原始 / 明细 · 开放承载</small>
        </div>
      </div>
      <SourceCards sources={sources} />
    </section>
  )
}

function LakeFirstLab({
  visualization,
}: {
  visualization: Extract<LakehouseVisualization, { focus: 'lake-first' }>
}) {
  const { lakeFirst } = visualization
  const [demandId, setDemandId] = useState<LakehouseDemandId>(lakeFirst.defaultDemandId)
  const assessment = useMemo(
    () => getLakeFirstAssessment(visualization.dataSources, lakeFirst, demandId),
    [demandId, lakeFirst, visualization.dataSources],
  )
  const assessmentBySourceId = new Map(
    assessment.items.map((item: LakehouseLakeFirstAssessmentItem) => [item.sourceId, item]),
  )

  return (
    <div className="lakehouse-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">Lake-first 需求观察</span>
          <p aria-live="polite">所有数据先在 Lake，Warehouse 只承接当前需求需要的部分。</p>
        </div>
      </div>
      <LabHeading
        eyebrow="10-1 · Lake-first"
        title="先把数据接住，再看谁值得进入 Warehouse"
        description="同一批银行数据先进入 Lake。切换访问频率、查询 SLA 和消费方式，观察哪些数据需要高性能服务层。"
      />
      <SourceToLake sources={visualization.dataSources} />
      <section className="lakehouse-demand" aria-labelledby="lakehouse-demand-title">
        <div className="lakehouse-lab__subheading">
          <div>
            <span className="eyebrow eyebrow--small">改变服务需求</span>
            <h4 id="lakehouse-demand-title">访问和 SLA 变了，承接方式会变吗？</h4>
          </div>
          <p>这里观察的是数据副本的必要性，不是给三种架构排名。</p>
        </div>
        <div className="lakehouse-demand-options" role="group" aria-label="选择访问需求">
          {lakeFirst.demands.map((demand) => (
            <button
              className={`lakehouse-demand-option${demand.id === demandId ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={demand.id === demandId}
              key={demand.id}
              onClick={() => setDemandId(demand.id)}
            >
              <strong>{demand.label}</strong>
              <small>{demand.description}</small>
            </button>
          ))}
        </div>
        <div className="lakehouse-demand-facts" aria-live="polite">
          <div>
            <span>访问频率</span>
            <strong>{assessment.demand.accessFrequency}</strong>
          </div>
          <div>
            <span>查询 SLA</span>
            <strong>{assessment.demand.querySla}</strong>
          </div>
          <div>
            <span>查询复杂度</span>
            <strong>{assessment.demand.queryComplexity}</strong>
          </div>
          <div>
            <span>消费方式</span>
            <strong>{assessment.demand.consumer}</strong>
          </div>
        </div>
        <div className="lakehouse-source-placement" aria-live="polite">
          {visualization.dataSources.map((source) => {
            const item = assessmentBySourceId.get(source.id)
            if (!item) {
              return null
            }

            const entersWarehouse = item.status === 'lake-and-warehouse'
            return (
              <article
                className={`lakehouse-placement-card${entersWarehouse ? ' is-warehouse' : ' is-lake-only'}`}
                key={source.id}
              >
                <div className="lakehouse-placement-card__heading">
                  <strong>{source.label}</strong>
                  <span>{entersWarehouse ? 'Lake + Warehouse' : 'Lake only'}</span>
                </div>
                <div className="lakehouse-placement-card__path">
                  <span>Lake</span>
                  <b aria-hidden="true">{entersWarehouse ? '→' : '·'}</b>
                  <span>{entersWarehouse ? 'Warehouse 服务层' : '继续保留'}</span>
                </div>
                <p>{item.reason}</p>
              </article>
            )
          })}
        </div>
        <div className="lakehouse-observation">
          <strong>{assessment.summary}</strong>
          <p>
            “冷热”来自访问频率、查询
            SLA、复杂度、消费方式和成本收益的组合。数据年龄可以参与判断，但不能单独决定去向。
          </p>
        </div>
      </section>
    </div>
  )
}

function ReplicationFlow({
  sources,
  config,
  synced,
}: {
  sources: readonly LakehouseDataSource[]
  config: LakehouseReplicationConfig
  synced: boolean
}) {
  const state = getReplicationState(config, synced)
  const primarySource = sources[0]

  return (
    <div className="lakehouse-replication-flow" aria-label="Source 到 Warehouse 的复制链路">
      <article className="lakehouse-replication-node">
        <span>Source</span>
        <strong>{primarySource?.label ?? 'Transaction'}</strong>
        <small>业务系统产生原始记录</small>
      </article>
      <span className="lakehouse-flow-arrow" aria-hidden="true">
        →
      </span>
      <article className="lakehouse-replication-node is-lake">
        <span>Lake · 1 份</span>
        <strong>{config.dataset.label}</strong>
        <small>{state.lakeVersion} · 完整承载</small>
      </article>
      <span className="lakehouse-flow-arrow" aria-hidden="true">
        →
      </span>
      <article className="lakehouse-replication-node is-sync">
        <span>Transform / Sync</span>
        <strong>{synced ? '同步已完成' : '等待同步'}</strong>
        <small>{state.syncDelay}</small>
      </article>
      <span className="lakehouse-flow-arrow" aria-hidden="true">
        →
      </span>
      <article className={`lakehouse-replication-node is-warehouse${synced ? ' is-ready' : ''}`}>
        <span>Warehouse · {synced ? '第 2 份' : '暂无副本'}</span>
        <strong>{synced ? config.dataset.label : '还没有数据'}</strong>
        <small>{synced ? state.warehouseVersion : '高频查询的服务层'}</small>
      </article>
    </div>
  )
}

function SchemaList({
  label,
  fields,
  emptyLabel,
}: {
  label: string
  fields: readonly string[] | null
  emptyLabel: string
}) {
  return (
    <div className="lakehouse-schema-list">
      <span>{label}</span>
      {fields ? (
        <ul>
          {fields.map((field) => (
            <li key={field}>
              <code>{field}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </div>
  )
}

function ReplicationLab({
  visualization,
}: {
  visualization: Extract<LakehouseVisualization, { focus: 'replication' }>
}) {
  const [synced, setSynced] = useState(false)
  const config = visualization.replication
  const state = useMemo(() => getReplicationState(config, synced), [config, synced])

  return (
    <div className="lakehouse-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">异构湖仓复制观察</span>
          <p aria-live="polite">
            当前副本：{state.replicaCount} 份 ·{' '}
            {state.syncStatus === 'synced' ? '已同步' : '尚未同步'}
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setSynced(false)}
          disabled={!synced}
        >
          重置同步
        </button>
      </div>
      <LabHeading
        eyebrow="10-2 · Lake → Warehouse"
        title="复制一份，换来什么？"
        description="Lake 已经保留了完整数据。点击同步，观察 Warehouse 为什么仍然需要自己的查询服务层，以及两边新增了哪些责任。"
      />
      <ReplicationFlow sources={visualization.dataSources} config={config} synced={synced} />
      <section
        className="lakehouse-replication-panel"
        aria-labelledby="lakehouse-replication-panel-title"
      >
        <div className="lakehouse-lab__subheading">
          <div>
            <span className="eyebrow eyebrow--small">同步前后</span>
            <h4 id="lakehouse-replication-panel-title">同一份业务数据，两个系统各自负责什么？</h4>
          </div>
          <p>副本增加后，查询能力增加，一致性责任也增加。</p>
        </div>
        <div className="lakehouse-replication-actions">
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => setSynced(true)}
            disabled={synced}
          >
            {synced ? '同步已完成' : '执行一次 Transform / Sync'}
          </button>
          <span aria-live="polite">
            {synced
              ? `完成时间：${config.syncedAt} · 用时：${config.syncDuration}`
              : 'Lake 中的数据仍然只有一份'}
          </span>
        </div>
        <div className="lakehouse-replica-summary" aria-live="polite">
          <article className="lakehouse-replica-card is-lake">
            <div>
              <span>Lake</span>
              <strong>第 1 份</strong>
            </div>
            <p>
              {config.dataset.identity} · {config.dataset.grain} ·{' '}
              {config.dataset.rowCount.toLocaleString('en-US')} 行
            </p>
            <SchemaList label="Schema" fields={state.lakeSchema} emptyLabel="没有 Schema" />
          </article>
          <article className={`lakehouse-replica-card is-warehouse${synced ? ' is-ready' : ''}`}>
            <div>
              <span>Warehouse</span>
              <strong>{synced ? '第 2 份' : '等待副本'}</strong>
            </div>
            <p>
              {synced
                ? '为高频分析提供独立的查询服务层。'
                : '为什么复制，要等到需求真的需要时再决定。'}
            </p>
            <SchemaList
              label="Schema"
              fields={state.warehouseSchema}
              emptyLabel="尚未同步，没有第二份表"
            />
          </article>
        </div>
        <div className="lakehouse-responsibility-grid">
          {state.responsibilities.map((responsibility) => (
            <article key={responsibility}>
              <span>同步后的责任</span>
              <p>{responsibility}</p>
            </article>
          ))}
        </div>
        <p className="lakehouse-replication-note">
          这条链路没有展开 CDC、Sqoop、Spark ETL
          或具体集成产品。需要记住的是：两套系统可以互补，但同步延迟、Schema / Version
          一致性、重跑和双体系运维都要有人负责。
        </p>
      </section>
    </div>
  )
}

function SnapshotTable({ snapshot }: { snapshot: LakehouseSnapshot }) {
  return (
    <div className="lakehouse-snapshot-table-wrap">
      <table className="lakehouse-snapshot-table">
        <caption>
          v{snapshot.version} · {snapshot.committedAt}
        </caption>
        <thead>
          <tr>
            {snapshot.columns.map((column) => (
              <th scope="col" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {snapshot.rows.map((row, index) => (
            <tr key={`${snapshot.id}-${index}`}>
              {snapshot.columns.map((column) => (
                <td key={column}>{formatCell(row, column)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatCell(row: LakehouseRow, column: string): string {
  const value = row[column]
  return value === null || value === undefined ? '—' : String(value)
}

function SchemaEvolutionChain({
  initialSnapshot,
  nextSnapshot,
}: {
  initialSnapshot: LakehouseSnapshot
  nextSnapshot: LakehouseSnapshot
}) {
  const steps = [
    {
      label: 'Schema Evolution',
      detail: `v1 的 ${initialSnapshot.columns.length} 个字段增加为 v2 的 ${nextSnapshot.columns.length} 个字段。`,
    },
    {
      label: 'Atomic Commit',
      detail: '整批文件一起进入可见状态，失败时不暴露半份更新。',
    },
    {
      label: 'Snapshot',
      detail: `成功提交后生成 v${nextSnapshot.version} Table State。`,
    },
    {
      label: 'Version History → Time Travel',
      detail: '保留 v1 与 v2，才能回看修改前的表。',
    },
  ]

  return (
    <ol className="lakehouse-schema-chain" aria-label="表能力形成链路">
      {steps.map((step, index) => (
        <li key={step.label}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{step.label}</strong>
          <p>{step.detail}</p>
        </li>
      ))}
    </ol>
  )
}

function FileCommitBatch({
  config,
  state,
}: {
  config: LakehouseTableLayerConfig
  state: ReturnType<typeof getAtomicCommitState>
}) {
  return (
    <section className="lakehouse-commit-batch" aria-labelledby="lakehouse-commit-batch-title">
      <div className="lakehouse-lab__subheading">
        <div>
          <span className="eyebrow eyebrow--small">Atomic Commit</span>
          <h4 id="lakehouse-commit-batch-title">一次更新准备写入 {config.fileCount} 个文件</h4>
        </div>
        <p aria-live="polite">
          {STATUS_LABELS[state.status]} · 本次批次可见 {state.visibleFileCount}/{state.fileCount}
        </p>
      </div>
      <ol className={`lakehouse-file-batch is-${state.status}`} aria-label="文件提交批次">
        {Array.from({ length: config.fileCount }, (_, index) => {
          const fileNumber = index + 1
          const fileStatus = getFileStatus(state.status, fileNumber, config.failureAt)
          return (
            <li className={`lakehouse-file-item is-${fileStatus}`} key={fileNumber}>
              <span>F{String(fileNumber).padStart(2, '0')}</span>
              <small>{FILE_STATUS_LABELS[fileStatus]}</small>
            </li>
          )
        })}
      </ol>
      <p className={`lakehouse-commit-message is-${state.status}`} aria-live="polite">
        {state.message}
      </p>
    </section>
  )
}

function SnapshotTimeline({
  snapshots,
  selectedVersion,
  onSelect,
}: {
  snapshots: readonly LakehouseSnapshot[]
  selectedVersion: number
  onSelect: (version: number) => void
}) {
  return (
    <div className="lakehouse-snapshot-timeline" aria-label="选择要读取的 Snapshot / Version">
      {snapshots.map((snapshot) => (
        <button
          className={selectedVersion === snapshot.version ? 'is-selected' : ''}
          type="button"
          aria-pressed={selectedVersion === snapshot.version}
          key={snapshot.id}
          onClick={() => onSelect(snapshot.version)}
        >
          <span>v{snapshot.version}</span>
          <small>{snapshot.committedAt}</small>
        </button>
      ))}
    </div>
  )
}

function TableLayerLab({
  visualization,
}: {
  visualization: Extract<LakehouseVisualization, { focus: 'table-layer' }>
}) {
  const { tableLayer } = visualization
  const initialSnapshot = visualization.snapshots[0]
  const [snapshots, setSnapshots] = useState<LakehouseSnapshot[]>(visualization.snapshots)
  const [selectedVersion, setSelectedVersion] = useState(initialSnapshot?.version ?? 1)
  const [commitStatus, setCommitStatus] = useState<LakehouseAtomicCommitStatus>('idle')
  const currentSnapshot = getLatestSnapshot(snapshots)
  const viewedSnapshot = timeTravelTo(snapshots, selectedVersion) ?? currentSnapshot
  const nextSnapshot = commitSnapshot(visualization.snapshots, visualization.evolutionCommit)[1]
  const commitState = getAtomicCommitState(tableLayer.fileCount, tableLayer.failureAt, commitStatus)

  if (!initialSnapshot || !nextSnapshot || !viewedSnapshot) {
    return null
  }

  function simulateFailure() {
    if (commitStatus === 'committed') {
      return
    }

    setCommitStatus('failed')
  }

  function commitEvolution() {
    if (commitStatus === 'committed') {
      return
    }

    setSnapshots(commitSnapshot(snapshots, visualization.evolutionCommit))
    setCommitStatus('committed')
    setSelectedVersion(nextSnapshot.version)
  }

  function resetExperiment() {
    setSnapshots(visualization.snapshots)
    setCommitStatus('idle')
    setSelectedVersion(initialSnapshot.version)
  }

  const isLatest = selectedVersion === currentSnapshot?.version
  const v2Schema = evolveSnapshotSchema(
    initialSnapshot,
    visualization.evolutionCommit.addedFields ?? [],
  )

  return (
    <div className="lakehouse-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">Table Layer 实验</span>
          <p aria-live="polite">
            {tableLayer.tableName} ·{' '}
            {isLatest ? '读取最新 Table State' : `Time Travel 到 v${selectedVersion}`}
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={resetExperiment}
        >
          重置实验
        </button>
      </div>
      <LabHeading
        eyebrow="10-3 · Files + Metadata / Table Layer"
        title="文件能读，为什么还不等于可靠的表？"
        description="沿同一份手机银行行为事件，先看字段变化，再模拟第 6 个文件失败，最后通过 Commit 生成 Snapshot、Version History，并回到旧版本。"
      />
      <section
        className="lakehouse-table-layer-intro"
        aria-labelledby="lakehouse-table-layer-title"
      >
        <div className="lakehouse-lab__subheading">
          <div>
            <span className="eyebrow eyebrow--small">Table Layer 的问题</span>
            <h4 id="lakehouse-table-layer-title">Files + Metadata / Table Layer</h4>
          </div>
          <p>{tableLayer.evolutionSummary}</p>
        </div>
        <div className="lakehouse-table-questions">
          <span>Schema 是什么？</span>
          <span>哪些文件属于正式版本？</span>
          <span>失败时读者看到什么？</span>
          <span>修改前还能回看吗？</span>
        </div>
      </section>
      <SchemaEvolutionChain initialSnapshot={initialSnapshot} nextSnapshot={nextSnapshot} />
      <section
        className="lakehouse-schema-compare"
        aria-labelledby="lakehouse-schema-compare-title"
      >
        <div className="lakehouse-lab__subheading">
          <div>
            <span className="eyebrow eyebrow--small">Schema Evolution</span>
            <h4 id="lakehouse-schema-compare-title">v1 → v2：新增一个明确管理的字段</h4>
          </div>
          <p>消费者读取到的是表的 Schema 变化，不必自行猜测某批文件多了什么。</p>
        </div>
        <div className="lakehouse-schema-versions">
          <SchemaList
            label="v1 · 原始事件"
            fields={initialSnapshot.columns}
            emptyLabel="没有字段"
          />
          <span className="lakehouse-schema-arrow" aria-hidden="true">
            →
          </span>
          <SchemaList label="v2 · 增加 channel" fields={v2Schema.columns} emptyLabel="没有字段" />
        </div>
      </section>
      <FileCommitBatch config={tableLayer} state={commitState} />
      <div className="lakehouse-table-layer-actions">
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={simulateFailure}
          disabled={commitStatus === 'committed' || commitStatus === 'failed'}
        >
          模拟第 {tableLayer.failureAt} 个文件失败
        </button>
        <button
          className="button button--primary button--small"
          type="button"
          onClick={commitEvolution}
          disabled={commitStatus === 'committed'}
        >
          {commitStatus === 'committed' ? '已 Commit v2' : 'Commit：发布 v2'}
        </button>
      </div>
      <section className="lakehouse-version-panel" aria-labelledby="lakehouse-version-title">
        <div className="lakehouse-lab__subheading">
          <div>
            <span className="eyebrow eyebrow--small">Snapshot / Version History</span>
            <h4 id="lakehouse-version-title">一次成功 Commit，产生一个新的 Table State</h4>
          </div>
          <p aria-live="polite">
            {isLatest
              ? `当前读取 v${viewedSnapshot.version}：${viewedSnapshot.change}`
              : `Time Travel 已回到 v${viewedSnapshot.version}：${viewedSnapshot.change}`}
          </p>
        </div>
        <SnapshotTimeline
          snapshots={snapshots}
          selectedVersion={selectedVersion}
          onSelect={setSelectedVersion}
        />
        <SnapshotTable snapshot={viewedSnapshot} />
        <p className="lakehouse-time-travel-note">
          {isLatest
            ? '当前查询读取最新版本。'
            : `今天发现加工结果有问题时，可以回到 v${selectedVersion} 查看修改之前的状态。`}
        </p>
      </section>
      <section className="lakehouse-open-format-note" aria-label="Open Table Format 现实示例">
        <div>
          <span className="eyebrow eyebrow--small">Open Table Format</span>
          <strong>这是抽象能力，不是某个产品的教程</strong>
        </div>
        <p>
          {tableLayer.openTableFormats.join('、')}{' '}
          都是现实世界中实现类似表管理能力的方案。本实验不做功能排名，也不比较 API、SQL syntax 或
          Catalog。
        </p>
      </section>
    </div>
  )
}

function UnityFlow({
  sources,
  mode,
  replicaCount,
}: {
  sources: readonly LakehouseDataSource[]
  mode: LakehouseUnityMode
  replicaCount: number
}) {
  const firstSource = sources[0]
  if (mode === 'heterogeneous') {
    return (
      <div className="lakehouse-unity-flow" aria-label="异构湖仓数据流">
        <div className="lakehouse-flow-node">
          <span>Source</span>
          <strong>{firstSource?.label ?? 'Transaction'}</strong>
          <small>业务数据进入平台</small>
        </div>
        <span className="lakehouse-flow-arrow" aria-hidden="true">
          →
        </span>
        <div className="lakehouse-flow-node is-emphasis">
          <span>Lake · 副本 1</span>
          <strong>开放存储 / Table</strong>
          <small>完整历史与原始上下文</small>
        </div>
        <span className="lakehouse-flow-arrow" aria-hidden="true">
          →
        </span>
        <div className="lakehouse-flow-node is-sync">
          <span>Copy / Transform</span>
          <strong>跨体系同步</strong>
          <small>需要保持两侧状态一致</small>
        </div>
        <span className="lakehouse-flow-arrow" aria-hidden="true">
          →
        </span>
        <div className="lakehouse-flow-node is-warehouse">
          <span>Warehouse · 副本 2</span>
          <strong>MPP / BI 表</strong>
          <small>稳定查询与报表</small>
        </div>
      </div>
    )
  }

  return (
    <div className="lakehouse-unity-flow is-shared" aria-label="共享基础能力的数据流">
      <div className="lakehouse-flow-node">
        <span>Source</span>
        <strong>{firstSource?.label ?? 'Transaction'}</strong>
        <small>数据持续进入</small>
      </div>
      <span className="lakehouse-flow-arrow" aria-hidden="true">
        →
      </span>
      <div className="lakehouse-flow-node is-shared-table">
        <span>Shared Storage / Table · 副本 {replicaCount}</span>
        <strong>同一份受管理数据</strong>
        <small>Storage、Table semantics、Metadata 协同共享</small>
      </div>
      <span className="lakehouse-flow-arrow" aria-hidden="true">
        →
      </span>
      <div className="lakehouse-compute-branch">
        <span>不同 Compute 仍可存在</span>
        <div>
          <strong>Lake Compute</strong>
          <strong>MPP / BI Compute</strong>
          <strong>其他分析引擎</strong>
        </div>
      </div>
    </div>
  )
}

function UnityLab({
  visualization,
}: {
  visualization: Extract<LakehouseVisualization, { focus: 'unity' }>
}) {
  const config = visualization.unity
  const [mode, setMode] = useState<LakehouseUnityMode>(config.defaultMode)
  const state = useMemo(() => getLakehouseUnityState(config, mode), [config, mode])

  return (
    <div className="lakehouse-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">湖仓一体边界观察</span>
          <p aria-live="polite">
            当前：{state.modeLabel} · 数据副本 {state.replicaCount} 份 · Compute 可继续不同
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setMode(config.defaultMode)}
          disabled={mode === config.defaultMode}
        >
          重置形态
        </button>
      </div>
      <LabHeading
        eyebrow="10-4 · Shared Foundations"
        title="湖仓一体，到底“一体”了什么？"
        description="切换异构湖仓与共享基础能力的形态，从 Storage、Table semantics、Metadata、Catalog、Data copy 和 Compute 逐项观察。"
      />
      <section
        className="lakehouse-unity-switcher"
        aria-labelledby="lakehouse-unity-switcher-title"
      >
        <div className="lakehouse-lab__subheading">
          <div>
            <span className="eyebrow eyebrow--small">形态切换</span>
            <h4 id="lakehouse-unity-switcher-title">不要用“几个集群”判断一体化</h4>
          </div>
          <p>物理上是不是一个集群，不是这里的核心判断。</p>
        </div>
        <div className="lakehouse-unity-options" role="group" aria-label="选择湖仓形态">
          <button
            className={mode === 'heterogeneous' ? 'is-selected' : ''}
            type="button"
            aria-pressed={mode === 'heterogeneous'}
            onClick={() => setMode('heterogeneous')}
          >
            <strong>异构湖仓</strong>
            <small>Lake 与 Warehouse 依靠不同体系协作</small>
          </button>
          <button
            className={mode === 'shared-table' ? 'is-selected' : ''}
            type="button"
            aria-pressed={mode === 'shared-table'}
            onClick={() => setMode('shared-table')}
          >
            <strong>共享基础能力的形态</strong>
            <small>同一份 Storage / Table 供多个 Compute 使用</small>
          </button>
        </div>
      </section>
      <UnityFlow
        sources={visualization.dataSources}
        mode={mode}
        replicaCount={state.replicaCount}
      />
      <section
        className="lakehouse-unity-comparison"
        aria-labelledby="lakehouse-unity-comparison-title"
      >
        <div className="lakehouse-lab__subheading">
          <div>
            <span className="eyebrow eyebrow--small">一体化观察表</span>
            <h4 id="lakehouse-unity-comparison-title">沿基础能力逐项看，而不是给架构打分</h4>
          </div>
          <p aria-live="polite">当前：{state.modeLabel}</p>
        </div>
        <div className="lakehouse-unity-table-wrap">
          <table className="lakehouse-unity-table">
            <caption>异构湖仓与共享基础能力形态的观察维度</caption>
            <thead>
              <tr>
                <th scope="col">观察维度</th>
                <th scope="col">当前形态</th>
              </tr>
            </thead>
            <tbody>
              {state.dimensions.map((dimension) => (
                <tr key={dimension.id}>
                  <th scope="row">{dimension.label}</th>
                  <td>{dimension.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section
        className="lakehouse-unity-responsibilities"
        aria-labelledby="lakehouse-unity-responsibilities-title"
      >
        <div className="lakehouse-lab__subheading">
          <div>
            <span className="eyebrow eyebrow--small">新增责任</span>
            <h4 id="lakehouse-unity-responsibilities-title">副本减少，不等于运维消失</h4>
          </div>
          <p>共享更多基础能力，系统仍要处理表、元数据和多引擎边界。</p>
        </div>
        <ul>
          {state.responsibilities.map((responsibility) => (
            <li key={responsibility}>{responsibility}</li>
          ))}
        </ul>
      </section>
      <p className="lakehouse-unity-note">
        湖仓一体不等于一个集群、一个数据库或一个组件；Lake 和 Warehouse 也不必消失。Storage /
        Compute Separation 是正交维度，现代 Warehouse 同样可能采用存算分离。
      </p>
    </div>
  )
}

export function LakehouseArchitectureLab({ visualization }: LakehouseArchitectureLabProps) {
  switch (visualization.focus) {
    case 'lake-first':
      return <LakeFirstLab visualization={visualization} />
    case 'replication':
      return <ReplicationLab visualization={visualization} />
    case 'table-layer':
      return <TableLayerLab visualization={visualization} />
    case 'unity':
      return <UnityLab visualization={visualization} />
    default:
      throw new Error('Unsupported Lakehouse visualization focus')
  }
}

export type { LakehouseArchitectureLabProps }
