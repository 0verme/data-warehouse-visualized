import type {
  LakehouseDataSource,
  LakehouseLakeFirstDemand,
  LakehouseReplicationConfig,
  LakehouseSnapshot,
  LakehouseSnapshotCommit,
  LakehouseUnityConfig,
} from '../../types'
import type { LessonContent } from '../types'

const bankingDataSources: LakehouseDataSource[] = [
  {
    id: 'transactions',
    label: 'Transaction（账户交易）',
    format: 'table',
    detail: '结构明确的一笔账户交易；AccountBalanceSnapshot 另有自己的状态语义。',
    example: 'transaction/2026-09-30/',
  },
  {
    id: 'mobile-events',
    label: '手机银行行为事件',
    format: 'event-log',
    detail: 'event_id、customer_id、event_type、event_time，数据可能持续到达。',
    example: 'mobile_event/2026-09-30/',
  },
  {
    id: 'partner-files',
    label: '合作方批量文件',
    format: 'json-file',
    detail: 'CSV / JSON 文件，先保留原始上下文，不扩展合作方业务模型。',
    example: 'partner_drop/2026-09-30/',
  },
]

const lakeFirstDemands = [
  {
    id: 'high-frequency-bi',
    label: '高频 BI',
    description: '每天反复读取的结构化经营结果。',
    accessFrequency: '高：每天多次',
    querySla: '较紧：固定交付窗口',
    queryComplexity: '固定聚合、结构稳定',
    consumer: 'BI / 报表',
    warehouseSourceIds: ['transactions'],
    warehouseReason: '结构稳定、访问频繁，准备 Warehouse 服务层可以减少重复查询成本。',
    lakeOnlyReason: '原始事件与文件仍先完整保留在 Lake，不因为 BI 需求全部复制。',
  },
  {
    id: 'low-frequency-history',
    label: '低频历史分析',
    description: '偶尔回看多年历史，允许查询耗时更长。',
    accessFrequency: '低：按需回看',
    querySla: '宽松：小时级也可接受',
    queryComplexity: '跨年份、保留上下文',
    consumer: '历史研究 / 探索',
    warehouseSourceIds: [],
    warehouseReason: '当前访问压力不足，建立副本的收益还不能覆盖复制和维护成本。',
    lakeOnlyReason: '完整历史与原始上下文是这次需求的重点，继续由 Lake 承载。',
  },
  {
    id: 'detail-retention',
    label: '长期明细留存',
    description: '重点是保存每笔记录，未来可能重新理解。',
    accessFrequency: '低到不确定',
    querySla: '未承诺固定时限',
    queryComplexity: '原始明细、问题开放',
    consumer: '审计回看 / 后续加工',
    warehouseSourceIds: [],
    warehouseReason: '长期留存本身不是复制理由；先保留可回溯的明细更合适。',
    lakeOnlyReason: 'Lake 提供容量和开放形态，暂时没有必要为低频明细建立高成本副本。',
  },
  {
    id: 'sla-query',
    label: 'SLA 查询',
    description: '有明确响应时间的结构化查询。',
    accessFrequency: '中到高：固定窗口',
    querySla: '明确：分钟级响应',
    queryComplexity: '结构化过滤与聚合',
    consumer: '经营看板 / 查询服务',
    warehouseSourceIds: ['transactions'],
    warehouseReason: '明确的查询 SLA 让结构化结果值得进入 Warehouse 服务层。',
    lakeOnlyReason: '事件和合作方文件暂时没有同等 SLA，继续保留在 Lake 等待需求成熟。',
  },
] satisfies readonly LakehouseLakeFirstDemand[]

const mobileEventSnapshots: LakehouseSnapshot[] = [
  {
    version: 1,
    id: 'snapshot-1',
    committedAt: '2026-09-30 10:00',
    columns: ['event_id', 'customer_id', 'event_type', 'event_time'],
    rows: [
      {
        event_id: 'MB001',
        customer_id: 'C001',
        event_type: 'login',
        event_time: '2026-09-30 09:58',
      },
      {
        event_id: 'MB002',
        customer_id: 'C001',
        event_type: 'transfer_view',
        event_time: '2026-09-30 09:59',
      },
    ],
    change: '手机银行行为事件首次形成可读取的表状态。',
  },
]

const mobileEventEvolutionCommit: LakehouseSnapshotCommit = {
  committedAt: '2026-09-30 11:30',
  change: '新增 channel，并提交为 v2 Snapshot；旧事件的 channel 用空值表示未知。',
  addedFields: [{ name: 'channel', label: '访问渠道', defaultValue: null }],
  rows: [
    {
      event_id: 'MB003',
      customer_id: 'C002',
      event_type: 'balance_view',
      event_time: '2026-09-30 11:28',
      channel: 'mobile-app',
    },
  ],
}

const replication: LakehouseReplicationConfig = {
  dataset: {
    id: 'account-balance-snapshot',
    label: 'AccountBalanceSnapshot（账户余额快照）',
    identity: 'account_id + snapshot_date',
    grain: '一行 = 一个 Account 在一个 snapshot_date 的余额状态',
    rowCount: 2_400_000,
    version: 'business_date=2026-09-30',
    schema: ['account_id', 'snapshot_date', 'balance', 'branch_id'],
  },
  syncDuration: '18 分钟',
  syncedAt: '2026-10-01 06:38',
  warehouseVersion: 'business_date=2026-09-30',
  warehouseSchema: ['account_id', 'snapshot_date', 'balance', 'branch_id'],
  responsibilities: [
    '同步延迟：Lake 已更新而 Warehouse 尚未完成时，查询者应该看到哪个版本？',
    'Schema 同步：字段变化后，谁确认两侧的表契约同时更新？',
    '重跑与一致性：失败后怎样避免重复副本、错版本或部分发布？',
  ],
}

const unity: LakehouseUnityConfig = {
  defaultMode: 'heterogeneous',
  dimensions: [
    {
      id: 'storage',
      label: 'Storage',
      heterogeneous: 'Lake 与 Warehouse 各自管理存储',
      sharedTable: '同一份共享 Storage / Table 作为基础',
    },
    {
      id: 'data-copy',
      label: 'Data copy',
      heterogeneous: '通常需要 Copy / Sync，可能有 2 份',
      sharedTable: '共享基础数据，减少复制；不承诺物理上零副本',
    },
    {
      id: 'table-semantics',
      label: 'Table semantics',
      heterogeneous: '两侧表语义需要分别对齐',
      sharedTable: '同一 Table Layer 语义供多个 Compute 访问',
    },
    {
      id: 'metadata',
      label: 'Metadata',
      heterogeneous: '两套 Metadata 需要同步和核对',
      sharedTable: 'Metadata 随共享表协同，但仍需要运维',
    },
    {
      id: 'catalog',
      label: 'Catalog',
      heterogeneous: '两个 Catalog 或跨目录协作',
      sharedTable: 'Catalog 可以统一或协同，取决于具体设计',
    },
    {
      id: 'compute',
      label: 'Compute',
      heterogeneous: 'Lake Compute 与 MPP / BI Compute 可以不同',
      sharedTable: '仍可不同：Lake Compute、MPP / BI Compute、其他引擎',
    },
    {
      id: 'governance',
      label: 'Governance',
      heterogeneous: '各体系分别落实权限、质量和生命周期',
      sharedTable: '治理可以作用于同一对象，但不会自动完成',
    },
  ],
  responsibilities: {
    heterogeneous: [
      '复制链路要处理同步延迟、重跑和两侧 Version 一致性。',
      '两套 Storage、Table、Metadata 和 Catalog 的责任边界都要有人维护。',
      '同一业务数据存在两份时，需要核对两份副本是否仍然可以互相解释。',
    ],
    'shared-table': [
      '共享 Table Layer 后，仍需维护 Schema Evolution、Commit、Snapshot 和历史保留。',
      'Metadata、Catalog、文件数量 / 布局和多引擎兼容仍需要运营。',
      '治理仍需明确 Owner、权限、质量、血缘和生命周期。',
    ],
  },
}

const sharedVisualizationData = {
  kind: 'lakehouse' as const,
  dataSources: bankingDataSources,
  snapshots: mobileEventSnapshots,
  evolutionCommit: mobileEventEvolutionCommit,
}

export const lakehouseVisualizations = {
  lakeFirst: {
    ...sharedVisualizationData,
    focus: 'lake-first' as const,
    lakeFirst: {
      demands: lakeFirstDemands,
      defaultDemandId: 'high-frequency-bi' as const,
    },
  },
  replication: {
    ...sharedVisualizationData,
    focus: 'replication' as const,
    replication,
  },
  tableLayer: {
    ...sharedVisualizationData,
    focus: 'table-layer' as const,
    tableLayer: {
      tableName: 'mobile_banking_events',
      fileCount: 10,
      failureAt: 6,
      openTableFormats: ['Apache Iceberg', 'Delta Lake', 'Apache Hudi'],
      evolutionSummary:
        '一组文件只有在 Metadata / Table Layer 记录后，才知道哪些文件属于当前表状态。',
    },
  },
  unity: {
    ...sharedVisualizationData,
    focus: 'unity' as const,
    unity,
  },
}

const sourceCards = [
  { label: '结构化', value: 'Transaction', detail: '稳定字段与明确事件 Grain' },
  { label: '行为事件', value: 'mobile event', detail: '持续到达，后续可能加字段' },
  { label: '文件', value: 'CSV / JSON', detail: '合作方批量原始上下文' },
]

export const lakehouseContent: LessonContent = {
  eyebrow: '第 10 章 · 统一入口，按需服务',
  opening: {
    eyebrow: '银行平台每天接到三种数据',
    title: '为什么所有数据先进湖，却只有一部分进入仓？',
    intro:
      'Transaction、手机银行事件和合作方文件都先进入 Lake。早上的经营看板需要稳定查询，几年前的行为记录却只在调查时才会被读到。它们不必接受同一种成本安排。',
    cards: sourceCards,
    question: '数据已经在 Lake，什么情况下还值得为查询建立 Warehouse 服务层？',
  },
  subtitle:
    '从 Lake-first 链路出发，根据访问、SLA、复杂度和成本收益判断哪些数据需要高性能查询服务。',
  quickSummary:
    '所有数据先进入 Lake；Warehouse 只按高频访问、明确 SLA 和结构化消费需求选择性承接，冷热由服务需求而非数据年龄单独决定。',
  concept: {
    term: 'Lake-first：统一承载，按需服务',
    definition:
      'Lake 先承担完整历史、原始 / 明细和多种形态；当部分结构化数据有高频访问或明确查询 SLA 时，再把它加工到 Warehouse 服务层。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先看三种数据怎样到达同一个底座',
      paragraphs: [
        'Transaction 是一笔账户交易，字段和行含义比较稳定；手机银行行为事件会持续到达；合作方批量文件则可能保留一段时间再分析。平台先把这三类输入放进 Lake，保留原始上下文和完整历史。',
        '这条链路给后续选择留下了空间：同一份数据可以继续在 Lake 中被低频读取，也可以因为 BI 或查询 SLA 的要求进入 Warehouse。进入仓是一次后续加工 / 同步，不是第二条并行接入路线。',
      ],
      bullets: [
        'Lake 负责先接住数据，不要求每种输入一开始就拥有相同的查询组织。',
        'AccountBalanceSnapshot 是状态快照，Transaction 是发生事件；两者的业务语义仍要分别说明。',
        '“能查询”只说明有读取路径，还没有说明应该为它投入多少服务成本。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '10-1 · Lake-first 数据流',
      title: '改变需求，看哪些数据值得进入 Warehouse',
      description:
        '所有输入先进入 Lake。切换访问频率、查询 SLA、查询复杂度和消费方式，观察当前需求下哪些数据需要建立 Warehouse 副本。',
      visualization: lakehouseVisualizations.lakeFirst,
    },
    {
      kind: 'narrative',
      title: '冷热是服务需求的组合判断',
      paragraphs: [
        '高频 BI 和固定 SLA 查询更愿意使用结构化、受管理的 Warehouse 服务层；低频历史分析和长期明细留存更看重 Lake 的容量、开放形态和完整上下文。查询复杂度、并发和消费方式也会改变这笔投入是否划算。',
        '因此同一份数据可能在某个阶段只留在 Lake，后来因为访问变频繁而增加 Warehouse 副本；也可能一直留在 Lake。数据“新不新”可以提供线索，却不能单独决定它是热还是冷。',
      ],
    },
    {
      kind: 'takeaway',
      title: 'Warehouse 是选择性高性能服务层',
      text: '典型链路可以写成“全部数据 → Lake → 按需选择 → MPP Warehouse”。Lake 与 Warehouse 的成本和查询能力存在工程取舍，具体表现还要结合引擎、布局、规模、并发和查询模式判断。',
      bullets: [
        '不需要高频服务的原始数据，没有理由因为“已经能查”就全部复制。',
        '需要明确 SLA 的结构化结果，可以用 Warehouse 换取更可预测的查询服务。',
        '同一个数据对象的冷热状态会随消费需求变化。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把湖和仓写成两个绝对标签',
      text: 'Lake 不必然慢，Warehouse 也不必然快；成本和性能都取决于数据布局、引擎、规模、并发和查询模式。下一节继续追问：建立第二份副本后，新增的责任由谁承担？',
    },
  ],
}

export const lakehouseReplicationContent: LessonContent = {
  eyebrow: '第 10 章 · 异构体系的复制代价',
  opening: {
    eyebrow: '经营分析需要昨天的账户余额',
    title: '湖里已经有一份，为什么仓里还要再有一份？',
    intro:
      'AccountBalanceSnapshot 已经完整落在 Lake。BI 查询要在固定窗口内反复回答机构和账户问题，团队决定把需要的结构化结果同步到 MPP / PG 类分析仓。',
    cards: [
      { label: 'Lake', value: '完整承载', detail: '长期保存原始 / 明细与历史' },
      { label: 'Warehouse', value: '查询服务', detail: '高频 BI、报表和聚合' },
      { label: '新增问题', value: '副本一致性', detail: '延迟、Schema、Version、重跑' },
    ],
    question: '复制没有改变业务数据的含义，却改变了系统需要维护的边界。',
  },
  subtitle: '沿 Source → Lake → Transform / Sync → Warehouse 看清复制带来的查询收益与双体系责任。',
  quickSummary:
    '异构湖仓让 Lake 和 Warehouse 各自承担擅长的工作，但同一份 AccountBalanceSnapshot 可能出现两份，复制、同步延迟和一致性检查随之出现。',
  concept: {
    term: '异构湖仓：能力互补，也要管理副本',
    definition:
      '两套数据管理 / 计算体系可以分别承载完整历史和高频查询；当数据在两侧出现时，Schema、Version、延迟和重跑都需要明确责任。',
  },
  sections: [
    {
      kind: 'narrative',
      title: 'Warehouse 的第二份数据从哪里来？',
      paragraphs: [
        '这里的 Lake 可以代表 Hive / 文件型存储这一类角色，Warehouse 可以代表 MPP / PG 类分析仓角色。它们不是产品对比对象，而是链路中两个不同的数据管理和计算边界。',
        'AccountBalanceSnapshot 的一行代表一个 Account 在某个 snapshot_date 的余额状态。Lake 适合保存这份完整历史，Warehouse 则为反复访问的结构化查询准备更直接的服务路径。',
      ],
      bullets: [
        '数据先到 Lake，再由后续 Transform / Sync 产生 Warehouse 副本。',
        'Warehouse 的存在理由是查询方式和 SLA，不是因为 Lake 中的那份“不算数据”。',
        '同一业务数据两侧都存在时，双方都要保留可解释的版本语义。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '10-2 · Transform / Sync',
      title: '执行一次同步，观察副本和责任同时增加',
      description:
        '先看 Lake 中唯一的一份 AccountBalanceSnapshot，再执行同步。页面只模拟链路结果，不展开 CDC、ETL 工具或具体产品实现。',
      visualization: lakehouseVisualizations.replication,
    },
    {
      kind: 'compare',
      title: '复制换来的能力与新增成本',
      intro: '两侧的分工可以合理，代价也要写进架构记录。',
      columns: [
        {
          label: 'Lake',
          title: '完整承载与开放访问',
          points: [
            '保存原始 / 明细和长期历史',
            '容纳事件与文件等多种形态',
            '适合低频、上下文优先的访问',
          ],
        },
        {
          label: 'Warehouse',
          title: '高频查询与明确 SLA',
          points: [
            '服务 BI、报表和聚合',
            '为结构化查询投入组织与计算资源',
            '让固定查询更容易形成服务契约',
          ],
        },
        {
          label: '两侧一起维护',
          title: '副本与双体系责任',
          points: ['重复存储和同步延迟', 'Schema / Version 一致性', '重跑、对账、治理与运维边界'],
        },
      ],
    },
    {
      kind: 'takeaway',
      title: '异构湖仓不是错误答案',
      text: '它用两套体系换取能力互补：Lake 保留完整数据，Warehouse 服务特定查询。需要接受的代价是同一业务数据可能有两份，以及两份数据之间的同步、版本和责任管理。',
      bullets: [
        '复制换来了查询服务，不会自动消除 Lake 的价值。',
        '同步成功不等于两侧永远一致，延迟和重跑边界要持续确认。',
        '这正是后面追问“能不能共享更多基础能力”的原因。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '不要把同步链路变成工具教程',
      text: '本节只确认复制发生在哪里、为什么发生以及责任增加在哪里。具体 CDC、ETL、数据集成产品和故障处理实现，留给相应的工程环境。',
    },
  ],
}

export const lakehouseTableLayerContent: LessonContent = {
  eyebrow: '第 10 章 · Files + Metadata',
  opening: {
    eyebrow: '一批手机银行事件已经写进 Lake',
    title: '文件上的数据怎样获得可靠的表能力？',
    intro:
      '文件可以被 SQL 引擎读取，但今天的读者还要知道当前 Schema、正式版本和失败写入是否可见。一次加工准备写 10 个文件，第 6 个文件失败时，半份新数据不能悄悄出现在结果里。',
    cards: [
      { label: 'v1', value: '4 个字段', detail: 'event_id、customer_id、event_type、event_time' },
      { label: '写入', value: '10 个文件', detail: '第 6 个文件作为失败演示' },
      { label: '想回看', value: '修改前状态', detail: '需要 Snapshot / Version History' },
    ],
    question: '文件负责承载字节，谁负责说明这一组文件现在代表哪张表？',
  },
  subtitle:
    '从 Files + Metadata / Table Layer 出发，把 Schema Evolution、Atomic Commit、Snapshot、Version 和 Time Travel 连成一个问题链。',
  quickSummary:
    'Table Layer 为文件集合补上可管理的表语义：Schema 变化有记录，Commit 有边界，Snapshot 形成版本，Time Travel 才能回到修改前的状态。',
  concept: {
    term: 'Table Layer：把文件组织成可管理的表',
    definition:
      '文件是物理承载，Table Layer 通过 Metadata 说明 Schema、文件集合和表状态，帮助读者看到完整提交并定位历史版本。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '“能读”还回答不了五个问题',
      paragraphs: [
        '手机银行事件的 v1 有 event_id、customer_id、event_type 和 event_time。下一批事件需要增加 channel。把新文件放进目录很容易，但读取方仍然要猜当前 Schema，确认哪些文件属于正式结果，并判断写入是否完整。',
        '如果加工任务在第 6 个文件失败，普通文件目录可能同时留下前 5 个新文件。读者看到的内容就不再对应一个清楚的表状态；发生误加工后，也没有天然的旧状态可供回看。',
      ],
      bullets: [
        'Schema Evolution 让字段变化成为一次明确的表变化。',
        'Atomic Commit 让整批更新整体可见或完全不可见。',
        'Snapshot / Version History 让表的不同状态可以被命名和定位。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '10-3 · Snapshot Experiment',
      title: '让一次 Commit 产生可回看的表状态',
      description:
        '先模拟第 6 个文件失败，确认上一版仍然可见；再 Commit v2，观察 channel 如何进入 Schema、Snapshot 如何形成 Version History，并选择 v1 进行 Time Travel。',
      visualization: lakehouseVisualizations.tableLayer,
    },
    {
      kind: 'narrative',
      title: '四个词描述的是一条因果链',
      paragraphs: [
        'Schema Evolution 说明表结构发生了变化。Atomic Commit 规定这次变化和新文件如何一起发布：第 6 个文件失败时，读者仍然看到旧 Table State。Commit 成功后，系统产生一个新的 Snapshot。',
        '多个 Snapshot 排成 Version History，Time Travel 就有了明确的读取目标。“今天发现加工结果有问题，看看修改之前是什么状态”因此成为一次有依据的查询，不是依赖文件名猜测。',
      ],
    },
    {
      kind: 'takeaway',
      title: 'Open Table Format 是一组表管理能力',
      text: 'Apache Iceberg、Delta Lake、Apache Hudi 是现实世界中实现类似能力的不同方案。本节只建立 Table Format 的抽象，不做产品排名，也不把 Lakehouse 等同于其中任意一个产品。',
      bullets: [
        'Schema / Commit / Snapshot / Version 共同说明表状态如何管理。',
        'Time Travel 是版本历史可定位后的自然使用方式。',
        '表能力解决可见性和历史问题，不自动解决所有性能和治理问题。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把 Time Travel 当成炫技功能',
      text: '它服务于真实的排查和回看：确定某个版本当时包含哪些数据、字段和状态。Partition Pruning、小文件、Compaction 参数和 Query Plan 不在本节解决。',
    },
  ],
}

export const lakehouseUnityContent: LessonContent = {
  eyebrow: '第 10 章 · 共享基础能力',
  opening: {
    eyebrow: '两套系统的边界开始重新设计',
    title: '湖仓一体到底“一体”了什么？',
    intro:
      '异构链路里，Lake 保存一份数据，Warehouse 再保存一份。另一种形态尝试让多个 Compute 访问共享的 Storage / Table，同时保留不同的查询和加工能力。',
    cards: [
      { label: '异构', value: 'Lake + Warehouse', detail: '复制后各自管理一套边界' },
      { label: '共享', value: 'Storage / Table', detail: '基础能力可能被多个 Compute 使用' },
      { label: '仍然存在', value: '多种 Compute', detail: 'Lake、MPP / BI、其他引擎' },
    ],
    question: '“一体”发生在存储、表语义、元数据还是数据副本？',
  },
  subtitle:
    '对照异构湖仓与共享基础能力的形态，逐项观察 Storage、Table、Metadata、Catalog、Compute 和治理边界。',
  quickSummary:
    '湖仓一体试图共享更多基础能力、减少割裂和复制；它不等于一个集群、一个组件，也不保证所有 Compute 合并。',
  concept: {
    term: '湖仓一体：共享基础能力，不抹平所有差异',
    definition:
      '判断“一体”要看 Storage、Data copy、Table semantics、Metadata、Catalog、Compute 和 Governance 如何协作，而不是只看物理集群数量。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先把“异构”这条旧链路摆出来',
      paragraphs: [
        '传统异构形态可以写成 Source → Lake → ETL / Copy → Warehouse。Lake 和 Warehouse 各自承担数据管理 / 计算工作，AccountBalanceSnapshot 或结构化交易结果在两侧形成可查询副本。',
        '这种方式在高频 BI、长期保留和团队边界明确的场景里仍然合理。它的代价是同步延迟、Schema / Version 对齐和两套治理 / 运维责任。',
      ],
      bullets: [
        '“异构”描述协作边界，不等于两个系统一定互相排斥。',
        '共享基础能力的目标是减少割裂，具体共享哪些层要逐项确认。',
        '物理上是否一个集群，不能替代对数据语义和副本的检查。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '10-4 · Shared Foundations',
      title: '切换形态，看“一体”落在哪些层',
      description:
        '在异构湖仓与共享基础能力的形态之间切换，观察副本数量、Storage、Table semantics、Metadata、Catalog、Compute、Governance 以及新增责任。',
      visualization: lakehouseVisualizations.unity,
    },
    {
      kind: 'compare',
      title: 'Storage 与 Compute 是两个问题',
      intro: '数据长期保存在哪里，不等于谁负责执行查询和加工。',
      columns: [
        {
          label: 'Storage / Table',
          title: '承载和管理数据状态',
          points: [
            '决定数据放置与副本关系',
            '提供 Schema、Commit、Snapshot 等表语义',
            '需要 Metadata / Catalog 说明对象',
          ],
        },
        {
          label: 'Compute',
          title: '执行查询和加工',
          points: ['可以有 Lake Compute', '可以有 MPP / BI Compute', '也可以继续接入其他分析引擎'],
        },
        {
          label: '工程决策',
          title: '把收益和责任放在一起',
          points: [
            '共享可能减少复制和同步',
            '表与元数据责任不会消失',
            '治理仍需作用于同一数据对象',
          ],
        },
      ],
    },
    {
      kind: 'takeaway',
      title: '“一体”是多层协同程度，不是先进性排名',
      text: '湖仓一体可以在 Storage、Table semantics、Metadata、Catalog 或 Data copy 等层共享更多基础能力，同时让不同 Compute 继续存在。它带来的收益和新增的 Table / Metadata / 多引擎运维责任，都需要结合当前约束判断。',
      bullets: [
        '传统异构 Lake + MPP Warehouse 在很多场景下依然完全合理。',
        '共享基础能力不自动完成 Owner、质量、血缘、权限和生命周期治理。',
        '架构记录应写需求、约束、收益、代价和不适用条件，不用人为分数替代判断。',
      ],
    },
    {
      kind: 'engineering-note',
      title: 'Lakehouse 也有长期维护成本',
      text: 'Schema Evolution 规则、Commit 协调、Snapshot 保留、Catalog / Metadata、文件布局、多引擎兼容和故障边界都可能成为新责任。第 11 章再讨论具体性能诊断，本章只确认这些责任存在。',
    },
  ],
}
