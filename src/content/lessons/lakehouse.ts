import type { LessonContent } from '../types'

export const lakehouseContent: LessonContent = {
  eyebrow: '第 09 章 · 一个问题，三条架构路径',
  opening: {
    eyebrow: '同一份数据，不同的边界',
    title: '订单表之外的日志，应该放在哪里？',
    intro:
      '订单、click / event 日志和 JSON 文件都进了平台。日报要准时、分析要保留原始上下文、ML 要能回看历史时点，三种需求会把架构推向不同的边界。',
    cards: [
      { label: '结构化', value: 'orders', detail: '订单与支付事实' },
      { label: '事件流', value: 'click / event', detail: '不断到达的行为日志' },
      { label: '半结构化', value: 'JSON / files', detail: '形态还在变化的原始数据' },
    ],
    question: '当“什么都能放”的文件堆开始被可靠查询，谁来负责 schema、事务和历史？',
  },
  subtitle: '当日报、探索分析和 ML 共用一份数据时，表能力、存储自由度和运维成本怎么取舍？',
  quickSummary:
    '用同一份订单、事件和文件数据切换 Warehouse、Data Lake、Lakehouse，再用同一订单案例对照传统数仓、Medallion 与 dbt 的建模组织视角。',
  concept: {
    term: 'Lakehouse：开放存储上的可管理表',
    definition:
      'Lakehouse 在开放存储之上增加 table layer、schema、事务和版本能力，让 BI、探索与 ML 可以共享一份更可靠的数据。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '同一份数据，三条路径怎么接？',
      paragraphs: [
        '订单适合结构化管理，click / event 日志和 JSON 文件则通常会被快速接入并保存，分析团队随后逐步理解其结构。数据湖让接入变得灵活；问题是，当 BI 需要稳定口径、多个任务同时写入，或分析师要回答“昨天当时看到了什么”，文件本身并不会自动提供答案。',
        '架构切换使用相同的 Ingestion 和 Consumer，方便比较 Storage、Table Layer、Compute、Governance 的能力变化。订单案例继续使用同一组数据，切换三种 transformation 组织视角时，存储和计算的选择保持不变。',
      ],
      bullets: [
        '订单、事件和 JSON 文件是同一组输入，不因为架构切换而消失。',
        'BI、ad-hoc analysis 和 ML 是同一组消费者，稳定性与自由度会分别变化。',
        '能力变强的同时，也要把元数据、文件布局和治理成本记进决策。',
      ],
    },
    {
      kind: 'narrative',
      title: '存储位置和加工组织是两件事',
      paragraphs: [
        'Warehouse、Data Lake、Lakehouse 比较的是存储、表能力、计算和工作负载边界；传统数仓、Medallion 与 dbt / Analytics Engineering 比较的是 transformation 如何分层、由谁拥有，以及什么对象交给消费者。两组问题有关联，但不是同一层面的答案。',
        '三套体系都可能处理原始保留、清洗、明细、复用和业务语义，却不会因此得到可互换的层名。下面的建模视角实验固定订单 1001、1002 和三条订单明细，让差异停留在职责与协作边界上。',
      ],
      bullets: [
        '上半段观察“承接数据的能力”；下半段观察“组织 transformation 的方式”。',
        '相似只表示问题有交集；owner、Grain、历史和消费者边界需要分别判断。',
        '不把 ODS / DWD / DWS / ADS、Bronze / Silver / Gold 和 Sources / Staging / Marts 当成翻译表。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '架构切换台 · 数据流与能力边界',
      title: '切换架构，比较结果与取舍',
      description:
        '切换三种架构，再改变 workload 和约束。数据流画布、能力矩阵、决策证据和开放表格式实验使用同一组状态；实验末尾还可以切换三种建模组织视角，比较 transformation 的责任边界。',
      visualization: {
        kind: 'lakehouse',
        dataSources: [
          {
            id: 'orders',
            label: '结构化订单',
            format: 'table',
            detail: 'order_id、amount、paid_at',
            example: 'orders table',
          },
          {
            id: 'events',
            label: 'click / event 日志',
            format: 'event-log',
            detail: '事件不断到达，字段会增加',
            example: 'events stream',
          },
          {
            id: 'json-files',
            label: 'JSON / 文件',
            format: 'json-file',
            detail: '半结构化原始上下文',
            example: 'landing/*.json',
          },
        ],
        scenarios: [
          {
            id: 'stable-bi',
            label: '稳定日报',
            description: '每天早上准时交付销售日报，权限和口径优先。',
            workload: 'bi',
            constraints: ['governance', 'history'],
            dataVolumeCategory: 'medium',
          },
          {
            id: 'flexible-exploration',
            label: '探索新问题',
            description: '字段还在变化，分析师希望低成本保留原始上下文。',
            workload: 'exploration',
            constraints: ['schema-change', 'cost-sensitive'],
            dataVolumeCategory: 'large',
          },
          {
            id: 'versioned-features',
            label: '版本化特征',
            description: '事件持续写入，训练特征还要能回到历史时点。',
            workload: 'ml',
            constraints: ['schema-change', 'concurrent-writes', 'history'],
            dataVolumeCategory: 'large',
          },
        ],
        snapshots: [
          {
            version: 1,
            id: 'snapshot-1',
            committedAt: '2026-09-13 10:00',
            columns: ['event_id', 'order_id', 'event_type'],
            rows: [
              { event_id: 'E001', order_id: 'O1001', event_type: 'click' },
              { event_id: 'E002', order_id: 'O1001', event_type: 'view' },
            ],
            change: '首个事件表：只有基础字段。',
          },
        ],
        evolutionCommit: {
          committedAt: '2026-09-13 11:30',
          change: '新事件增加 device_type，并提交为 v2 snapshot。',
          addedFields: [{ name: 'device_type', label: '设备类型', defaultValue: null }],
          rows: [
            {
              event_id: 'E003',
              order_id: 'O1002',
              event_type: 'click',
              device_type: 'mobile',
            },
          ],
        },
      },
    },
    {
      kind: 'narrative',
      title: 'Table Layer 解决的是“文件能读”之外的问题',
      paragraphs: [
        '实验里的 v1 只有基础字段。新事件带来 device_type 后，普通文件堆可以把新文件放进去，但读取方必须自己猜 schema、判断写入是否完成，还要记住哪一批文件代表哪个历史时点。',
        '可管理表把这次变化记录为一次 commit：v2 读到新字段，旧行用明确的空值补齐；time travel 回到 v1 时，字段和行都恢复到提交前的状态。这里演示的是抽象的开放表格式概念，不绑定 Iceberg、Delta 或 Hudi。',
      ],
    },
    {
      kind: 'takeaway',
      title: '架构选择要写出条件与代价',
      text: '选择 Warehouse、Data Lake 还是 Lakehouse，取决于当前 workload、约束和团队能承担的运维边界。依据证据，把收益、代价、风险和不适用条件写进 ADR。',
      bullets: [
        '稳定 BI 可能更看重查询契约和治理，而不是最大灵活性。',
        '探索与 ML 可能更看重原始上下文、开放存储和跨引擎访问。',
        'Lakehouse 也有真实代价：表格式、元数据、文件布局和治理都需要长期维护。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '湖仓一体的工程权衡：运维复杂度与存储灵活性',
      text: '开放存储带来格式和访问方式的自由，也把表格式、元数据、文件布局、权限和故障处理的责任留给团队。选择 Lakehouse 时，要把这些长期运维成本与多工作负载共享数据的收益放在一起衡量。',
    },
    {
      kind: 'pitfall',
      title: '不要把 Lakehouse 当成默认终局',
      text: '如果业务只有少量稳定报表，传统 Warehouse 可能更简单；如果团队只需要低成本接住原始数据，Data Lake 也可能足够。只有当共享数据、多个工作负载和可靠表能力的收益超过新增复杂度时，Lakehouse 才值得选择。',
    },
  ],
}
