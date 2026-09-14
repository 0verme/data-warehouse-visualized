import type {
  LakehouseArchitecture,
  LakehouseArchitectureState,
  LakehouseCapability,
  LakehouseCapabilityLevel,
  LakehouseCapabilityMatrix,
  LakehouseConstraint,
  LakehouseConsumerState,
  LakehouseDataVolumeCategory,
  LakehouseDecision,
  LakehouseDecisionRecord,
  LakehouseFlowStage,
  LakehouseRow,
  LakehouseSchemaField,
  LakehouseSnapshot,
  LakehouseSnapshotCommit,
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
  shortLabel: string
  detail: string
}[] = [
  {
    id: 'warehouse',
    label: 'Warehouse',
    shortLabel: '数仓',
    detail: '先把数据整理成受管理的表，再服务稳定查询。',
  },
  {
    id: 'lake',
    label: 'Data Lake',
    shortLabel: '数据湖',
    detail: '先接住多种原始数据，把灵活性放在存储入口。',
  },
  {
    id: 'lakehouse',
    label: 'Lakehouse',
    shortLabel: '湖仓',
    detail: '在开放存储之上补上表、事务和版本能力。',
  },
]

export const LAKEHOUSE_WORKLOAD_OPTIONS: readonly {
  id: LakehouseWorkload
  label: string
  detail: string
}[] = [
  { id: 'bi', label: '稳定日报 / BI', detail: '口径固定，查询要稳定、可复用。' },
  { id: 'exploration', label: '探索分析', detail: '问题和字段会变，先保留更多原始上下文。' },
  { id: 'ml', label: 'ML / 特征数据', detail: '需要访问宽泛数据，并重复构造训练特征。' },
  { id: 'streaming', label: '流式 / 持续写入', detail: '事件不断到达，还要让读者看到一致结果。' },
]

export const LAKEHOUSE_CONSTRAINT_OPTIONS: readonly {
  id: LakehouseConstraint
  label: string
  detail: string
}[] = [
  { id: 'schema-change', label: 'schema 经常变化', detail: '新事件可能随时增加字段。' },
  { id: 'concurrent-writes', label: '并发写入', detail: '多个任务可能同时写同一张表。' },
  { id: 'history', label: '历史追溯', detail: '需要回答“当时看到的是什么”。' },
  { id: 'cost-sensitive', label: '成本敏感', detail: '希望先用便宜、弹性的存储承接数据。' },
  { id: 'governance', label: '治理要求高', detail: '权限、质量和责任边界不能靠约定。' },
]

export const LAKEHOUSE_CAPABILITY_LABELS: Record<LakehouseCapability, string> = {
  'flexible-storage': '多形态存储',
  'schema-management': 'Schema 管理',
  transactions: '事务 / 一致性',
  'version-history': '版本 / 历史',
  'stable-query': '稳定查询',
  'ad-hoc-analysis': '探索分析',
  'ml-access': 'ML 数据访问',
  'streaming-writes': '持续写入',
  governance: '质量 / 治理',
  'compute-separation': '存储计算分离',
}

export const LAKEHOUSE_CAPABILITY_MATRIX: Record<LakehouseArchitecture, LakehouseCapabilityMatrix> =
  {
    warehouse: {
      'flexible-storage': 'limited',
      'schema-management': 'strong',
      transactions: 'strong',
      'version-history': 'partial',
      'stable-query': 'strong',
      'ad-hoc-analysis': 'partial',
      'ml-access': 'partial',
      'streaming-writes': 'partial',
      governance: 'strong',
      'compute-separation': 'partial',
    },
    lake: {
      'flexible-storage': 'strong',
      'schema-management': 'limited',
      transactions: 'limited',
      'version-history': 'limited',
      'stable-query': 'limited',
      'ad-hoc-analysis': 'strong',
      'ml-access': 'strong',
      'streaming-writes': 'partial',
      governance: 'limited',
      'compute-separation': 'strong',
    },
    lakehouse: {
      'flexible-storage': 'strong',
      'schema-management': 'strong',
      transactions: 'strong',
      'version-history': 'strong',
      'stable-query': 'strong',
      'ad-hoc-analysis': 'strong',
      'ml-access': 'strong',
      'streaming-writes': 'strong',
      governance: 'partial',
      'compute-separation': 'strong',
    },
  }

const WORKLOAD_SCORES: Record<LakehouseWorkload, Record<LakehouseArchitecture, number>> = {
  bi: { warehouse: 8, lake: 1, lakehouse: 6 },
  exploration: { warehouse: 2, lake: 8, lakehouse: 6 },
  ml: { warehouse: 2, lake: 7, lakehouse: 8 },
  streaming: { warehouse: 2, lake: 6, lakehouse: 8 },
}

const CONSTRAINT_SCORES: Record<LakehouseConstraint, Record<LakehouseArchitecture, number>> = {
  'schema-change': { warehouse: -2, lake: 3, lakehouse: 2 },
  'concurrent-writes': { warehouse: 2, lake: -2, lakehouse: 3 },
  history: { warehouse: 1, lake: -2, lakehouse: 3 },
  'cost-sensitive': { warehouse: -3, lake: 3, lakehouse: 1 },
  governance: { warehouse: 3, lake: -3, lakehouse: 2 },
}

const WORKLOAD_EVIDENCE: Record<LakehouseWorkload, string> = {
  bi: '稳定日报更依赖可预测的 schema、查询计划和治理边界。',
  exploration: '探索分析更依赖原始上下文和低门槛的数据访问。',
  ml: 'ML 更依赖跨结构化、事件和文件数据的统一访问。',
  streaming: '持续写入更依赖并发提交和读写之间的一致视图。',
}

const CONSTRAINT_EVIDENCE: Record<LakehouseConstraint, string> = {
  'schema-change': '字段演进需要有明确的兼容规则，而不是让每个消费者猜测。',
  'concurrent-writes': '并发写入需要提交边界，否则读者可能看到半成品文件。',
  history: '历史追溯需要可命名、可定位的版本，而不是只保留当前文件。',
  'cost-sensitive': '成本敏感时，开放存储的弹性会影响方案的总成本。',
  governance: '治理要求高时，权限、质量和责任不能只靠目录约定。',
}

const ARCHITECTURE_PROFILES: Record<
  LakehouseArchitecture,
  {
    storageType: string
    computeSeparation: LakehouseArchitectureState['computeSeparation']
    partitionFileLayoutHint: string
    stages: Record<LakehouseFlowStage['id'], { title: string; detail: string }>
  }
> = {
  warehouse: {
    storageType: '受管理的表存储',
    computeSeparation: 'partial',
    partitionFileLayoutHint: '按日期 / 主题分区，优先维护稳定的表与索引契约。',
    stages: {
      ingestion: { title: '先建模再接入', detail: '订单可直接入表；事件和 JSON 通常要先转换。' },
      storage: { title: '受管理表', detail: '存储与表服务绑定，查询路径更可预测。' },
      'table-layer': { title: 'Schema 是门', detail: '字段、类型和约束先被表契约固定下来。' },
      compute: { title: '查询优先', detail: 'BI 查询稳定，但探索和 ML 可能需要复制数据。' },
      governance: { title: '治理边界清晰', detail: '权限、质量和责任通常集中在表和目录层。' },
    },
  },
  lake: {
    storageType: '对象存储文件',
    computeSeparation: 'separated',
    partitionFileLayoutHint: '按来源 / 日期组织目录；需要自己控制小文件、分区和 schema。',
    stages: {
      ingestion: { title: '先接住再说', detail: '订单、点击和 JSON 文件都能先落下。' },
      storage: { title: '文件堆', detail: '对象存储便宜灵活，但文件本身不保证一起提交。' },
      'table-layer': { title: '约定式 Schema', detail: '字段规则依赖读取方和目录约定，容易漂移。' },
      compute: { title: '按需读取', detail: '探索和 ML 很自由，但稳定 BI 要额外加工。' },
      governance: { title: '治理靠补丁', detail: '质量、权限和血缘需要额外工具与流程承接。' },
    },
  },
  lakehouse: {
    storageType: '对象存储 + 开放表格式',
    computeSeparation: 'separated',
    partitionFileLayoutHint: '开放表管理分区与文件布局；仍需治理小文件、压缩和元数据成本。',
    stages: {
      ingestion: { title: '多形态接入', detail: '订单、事件和文件可以先进入开放存储。' },
      storage: { title: '开放存储', detail: '计算引擎与存储解耦，数据不锁在单一计算服务里。' },
      'table-layer': {
        title: 'Table Layer',
        detail: 'Schema、事务和 snapshot 把文件组织成可管理的表。',
      },
      compute: { title: '多引擎消费', detail: 'BI、探索和 ML 可以共享同一份表数据。' },
      governance: { title: '能力延续但不自动', detail: '表层提供线索，治理、质量和血缘仍要运营。' },
    },
  },
}

const STAGE_CAPABILITIES: Record<LakehouseFlowStage['id'], LakehouseCapability[]> = {
  ingestion: ['streaming-writes', 'flexible-storage'],
  storage: ['flexible-storage', 'compute-separation'],
  'table-layer': ['schema-management', 'transactions', 'version-history'],
  compute: ['stable-query', 'ad-hoc-analysis'],
  governance: ['governance'],
}

const CONSUMER_CAPABILITIES: Record<'bi' | 'ad-hoc' | 'ml', LakehouseCapability> = {
  bi: 'stable-query',
  'ad-hoc': 'ad-hoc-analysis',
  ml: 'ml-access',
}

const CONSUMER_LABELS: Record<'bi' | 'ad-hoc' | 'ml', string> = {
  bi: 'BI',
  'ad-hoc': 'ad-hoc analysis',
  ml: 'ML',
}

const LEVEL_WEIGHT: Record<LakehouseCapabilityLevel, number> = {
  limited: 0,
  partial: 1,
  strong: 2,
}

function getWeakestLevel(levels: readonly LakehouseCapabilityLevel[]): LakehouseCapabilityLevel {
  return levels.reduce(
    (weakest, level) => (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[weakest] ? level : weakest),
    'strong' as LakehouseCapabilityLevel,
  )
}

function getArchitectureLabel(architecture: LakehouseArchitecture): string {
  return (
    LAKEHOUSE_ARCHITECTURE_OPTIONS.find((option) => option.id === architecture)?.shortLabel ??
    architecture
  )
}

export function getCapabilityMatrix(
  architecture: LakehouseArchitecture,
): LakehouseCapabilityMatrix {
  return LAKEHOUSE_CAPABILITY_MATRIX[architecture]
}

export function getArchitectureFlow(architecture: LakehouseArchitecture): LakehouseFlowStage[] {
  const matrix = getCapabilityMatrix(architecture)
  const profile = ARCHITECTURE_PROFILES[architecture]

  return (Object.keys(STAGE_CAPABILITIES) as LakehouseFlowStage['id'][]).map((id) => ({
    id,
    label:
      id === 'ingestion'
        ? 'Ingestion'
        : id === 'storage'
          ? 'Storage'
          : id === 'table-layer'
            ? 'Table Layer'
            : id === 'compute'
              ? 'Compute'
              : 'Governance',
    status: getWeakestLevel(STAGE_CAPABILITIES[id].map((capability) => matrix[capability])),
    ...profile.stages[id],
  }))
}

export function getConsumerStates(architecture: LakehouseArchitecture): LakehouseConsumerState[] {
  const matrix = getCapabilityMatrix(architecture)

  return (Object.keys(CONSUMER_CAPABILITIES) as ('bi' | 'ad-hoc' | 'ml')[]).map((id) => ({
    id,
    label: CONSUMER_LABELS[id],
    status: matrix[CONSUMER_CAPABILITIES[id]],
    detail:
      id === 'bi'
        ? matrix['stable-query'] === 'strong'
          ? '可直接承接稳定日报和指标服务。'
          : '需要额外加工层，才能稳定复用口径。'
        : id === 'ad-hoc'
          ? matrix['ad-hoc-analysis'] === 'strong'
            ? '可保留原始上下文，支持临时问题。'
            : '自由度受表模型和资源边界限制。'
          : matrix['ml-access'] === 'strong'
            ? '可共享事件与文件特征，减少复制。'
            : '通常需要导出或复制到专用 ML 空间。',
  }))
}

export function getArchitectureState(
  architecture: LakehouseArchitecture,
  workload: LakehouseWorkload,
  dataVolumeCategory: LakehouseDataVolumeCategory,
): LakehouseArchitectureState {
  const profile = ARCHITECTURE_PROFILES[architecture]

  return {
    architecture,
    storageType: profile.storageType,
    computeSeparation: profile.computeSeparation,
    partitionFileLayoutHint: profile.partitionFileLayoutHint,
    workload,
    dataVolumeCategory,
  }
}

export function evaluateArchitecture(
  workload: LakehouseWorkload,
  constraints: readonly LakehouseConstraint[],
): LakehouseDecision {
  const scores = LAKEHOUSE_ARCHITECTURES.reduce(
    (result, architecture) => {
      result[architecture] = WORKLOAD_SCORES[workload][architecture]
      constraints.forEach((constraint) => {
        result[architecture] += CONSTRAINT_SCORES[constraint][architecture]
      })
      return result
    },
    {} as Record<LakehouseArchitecture, number>,
  )

  const recommendedArchitecture = LAKEHOUSE_ARCHITECTURES.reduce(
    (best, architecture) => (scores[architecture] > scores[best] ? architecture : best),
    LAKEHOUSE_ARCHITECTURES[0],
  )

  const evidence: LakehouseDecision['evidence'] = [
    { kind: 'fit', text: WORKLOAD_EVIDENCE[workload] },
    {
      kind: 'fit',
      text: `当前证据更支持 ${getArchitectureLabel(recommendedArchitecture)}：得分 ${scores[recommendedArchitecture]}。`,
    },
  ]

  constraints.forEach((constraint) => {
    evidence.push({ kind: 'tradeoff', text: CONSTRAINT_EVIDENCE[constraint] })
  })

  if (recommendedArchitecture === 'lakehouse') {
    evidence.push({
      kind: 'risk',
      text: '它补上了表能力，但也把元数据、文件布局和治理运营责任带进系统。',
    })
  }

  return { scores, recommendedArchitecture, evidence }
}

const BASE_RECORDS: Record<
  LakehouseArchitecture,
  Pick<LakehouseDecisionRecord, 'benefits' | 'tradeoffs' | 'risks' | 'notSuitableWhen'>
> = {
  warehouse: {
    benefits: [
      'Schema、事务和查询契约集中管理，稳定日报容易复用。',
      '治理边界清晰，质量检查更容易成为表的发布门。',
    ],
    tradeoffs: [
      '原始事件和 JSON 往往要先转换，探索路径变长。',
      '存储与计算边界较集中，ML 可能需要复制数据。',
    ],
    risks: [
      '来源字段变化会排队等待模型调整。',
      '为新工作负载不断加宽表或复制数据，形成新的管道维护成本。',
    ],
    notSuitableWhen: [
      '原始数据形态很多，而且需要先保留再理解。',
      '大量 ML 或 ad-hoc 工作负载要直接访问原始上下文。',
    ],
  },
  lake: {
    benefits: [
      '对象存储可以低成本接住订单、事件和半结构化文件。',
      '开放文件让探索分析和 ML 更容易拿到完整上下文。',
    ],
    tradeoffs: [
      '文件本身不提供提交、版本和稳定 schema，需要额外补能力。',
      '稳定 BI 需要额外的整理、质量和查询服务。',
    ],
    risks: [
      '并发写入可能产生重复、半成品或不可解释的文件状态。',
      '目录、字段和权限约定漂移后，消费者很难判断哪份数据可信。',
    ],
    notSuitableWhen: [
      '核心业务依赖稳定口径、并发更新和历史回溯。',
      '团队没有能力持续维护元数据、质量和文件生命周期。',
    ],
  },
  lakehouse: {
    benefits: [
      '开放存储保留多形态数据，Table Layer 又提供 schema、事务和版本。',
      'BI、探索和 ML 可以在同一份受管理数据上协作。',
    ],
    tradeoffs: [
      '表格式、元数据、文件布局和多计算引擎让系统更复杂。',
      '治理能力不会因为有 snapshot 就自动完成。',
    ],
    risks: [
      '小文件、分区设计和元数据膨胀会把成本转移到运维。',
      '如果没有明确 owner，开放性可能变成更多不受控的写入入口。',
    ],
    notSuitableWhen: [
      '数据量和工作负载很小，传统数仓已经足够简单。',
      '团队暂时无法承担表格式、文件布局和治理的长期维护。',
    ],
  },
}

function addUnique(items: string[], additions: readonly string[]): string[] {
  return [...new Set([...items, ...additions])]
}

export function buildDecisionRecord(
  architecture: LakehouseArchitecture,
  workload: LakehouseWorkload,
  constraints: readonly LakehouseConstraint[],
): LakehouseDecisionRecord {
  const base = BASE_RECORDS[architecture]
  let benefits = [...base.benefits]
  let tradeoffs = [...base.tradeoffs]
  let risks = [...base.risks]
  let notSuitableWhen = [...base.notSuitableWhen]

  if (constraints.includes('schema-change')) {
    if (architecture === 'lake' || architecture === 'lakehouse') {
      benefits = addUnique(benefits, ['可以先接纳新增字段，再把兼容规则写进表层契约。'])
    } else {
      tradeoffs = addUnique(tradeoffs, ['频繁字段变化会增加建模和发布协调。'])
    }
  }

  if (constraints.includes('concurrent-writes')) {
    if (architecture === 'warehouse' || architecture === 'lakehouse') {
      benefits = addUnique(benefits, ['提交边界能让并发写入对读者呈现一致结果。'])
    } else {
      risks = addUnique(risks, ['没有事务边界时，读取方需要自己去重和判断写入是否完成。'])
    }
  }

  if (constraints.includes('history')) {
    if (architecture === 'lakehouse') {
      benefits = addUnique(benefits, ['Snapshot 和 time travel 让“当时的表”成为可定位对象。'])
    } else if (architecture === 'lake') {
      tradeoffs = addUnique(tradeoffs, ['历史只能依赖文件命名、目录或额外快照约定。'])
    }
  }

  if (constraints.includes('cost-sensitive')) {
    if (architecture === 'warehouse') {
      risks = addUnique(risks, ['当原始数据和计算负载增长时，集中式存储计算可能更昂贵。'])
    } else {
      benefits = addUnique(benefits, ['可以把低频原始数据保留在弹性更高的开放存储中。'])
    }
  }

  if (constraints.includes('governance')) {
    if (architecture === 'lake') {
      risks = addUnique(risks, ['高治理要求下，文件目录约定很难单独承担权限和质量责任。'])
    } else {
      benefits = addUnique(benefits, ['可以把 schema、质量和访问责任绑定到更明确的表边界。'])
    }
  }

  if (workload === 'bi' && architecture !== 'warehouse') {
    tradeoffs = addUnique(tradeoffs, [
      '稳定日报需要额外验证查询契约，不能只因为数据能读就认为口径稳定。',
    ])
  }

  if (workload === 'ml' && architecture === 'warehouse') {
    notSuitableWhen = addUnique(notSuitableWhen, [
      '训练特征需要频繁回看原始事件和文件，而复制链路不可接受。',
    ])
  }

  if (workload === 'streaming' && architecture === 'lake') {
    risks = addUnique(risks, ['持续写入和读侧查询之间缺少共同提交视图。'])
  }

  return {
    workload,
    constraints: [...constraints],
    chosenArchitecture: architecture,
    benefits,
    tradeoffs,
    risks,
    notSuitableWhen,
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
