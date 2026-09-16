import type { LessonContent } from '../types'

export const warehouseLayersContent: LessonContent = {
  eyebrow: '第 01 章 · 1-2 公共加工与职责分离',
  subtitle: '下游需求越来越多时，把同一套数据处理沉淀在公共位置，才能避免每个入口各算一遍。',
  quickSummary:
    '从一张存贷比报表开始，逐步增加日报、经营报表、驾驶舱和 API，观察数据分层如何减少重复处理并隔离变化。',
  concept: {
    term: '分层的职责',
    definition:
      '把原始接入、统一整理、公共加工和下游服务分配给不同职责，让通用处理可以复用，来源变化也有清楚的影响边界。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '第一个需求看不出问题',
      paragraphs: [
        '只有一张存贷比报表时，团队很容易把“从核心系统取存款、从信贷系统取贷款、按分行对齐、算出比值”全部写在一个报表查询里。需求能交付，重复处理的成本暂时看不见。',
        '当需求继续增加，存贷比日报、分行经营报表、管理驾驶舱和数据接口都需要同一批事实。每个下游如果重新抽取、清洗、对齐机构、汇总余额和计算指标，规则就会被复制到多个地方。',
      ],
      bullets: [
        '一个下游：核心系统 + 信贷系统 → 存贷比报表。',
        '两个下游：存贷比日报和分行经营报表各自做一遍加工。',
        '更多下游：驾驶舱、API 等继续复制同样的处理步骤。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '职责演变实验 · 看重复处理在哪里出现',
      title: '下游越多，公共加工越值得沉淀',
      description:
        '切换需求数量，比较每个下游各自处理与公共加工被复用的差别。这里先看职责，不要求记住任何固定层名。',
      visualization: {
        kind: 'layer-evolution',
        sources: [
          { id: 'core-banking', label: '核心系统', detail: '存款余额 120 亿、机构信息' },
          { id: 'credit-system', label: '信贷系统', detail: '贷款余额 90 亿、机构信息' },
        ],
        demands: [
          {
            id: 'one-consumer',
            label: '一个下游',
            title: '存贷比报表',
            description: '单个需求可以直接完成一次加工，但处理步骤还没有形成公共资产。',
            architecture: 'direct',
            consumers: [{ id: 'ratio-report', label: '存贷比报表', detail: '杭州分行：75%' }],
            repeatedWork: ['抽取两套系统', '按机构对齐', '汇总余额并计算存贷比'],
          },
          {
            id: 'two-consumers',
            label: '两个下游',
            title: '日报 + 经营报表',
            description: '两个入口开始重复做同一套抽取、清洗和机构对齐，修改规则时需要同步多处。',
            architecture: 'direct',
            consumers: [
              { id: 'ratio-daily', label: '存贷比日报', detail: '每日自动生成' },
              { id: 'branch-report', label: '分行经营报表', detail: '按机构查看' },
            ],
            repeatedWork: ['抽取两套系统', '清洗并对齐机构', '汇总余额并计算存贷比'],
          },
          {
            id: 'many-consumers',
            label: '多个下游',
            title: '公共加工 + 多种使用',
            description:
              '驾驶舱和 API 加入后，通用处理沉淀为公共能力，再由不同下游按自己的形式使用。',
            architecture: 'shared',
            consumers: [
              { id: 'ratio-daily', label: '存贷比日报', detail: '每日自动生成' },
              { id: 'branch-report', label: '分行经营报表', detail: '按机构查看' },
              { id: 'management-dashboard', label: '管理驾驶舱', detail: '综合经营视图' },
              { id: 'metrics-api', label: '数据接口', detail: '供其他系统调用' },
            ],
            repeatedWork: ['统一保存原始输入', '一次完成机构对齐和余额汇总', '共享存贷比计算结果'],
          },
        ],
        sharedStages: [
          {
            id: 'raw-data',
            label: '原始数据',
            title: '保留来源事实',
            detail: '接住核心系统和信贷系统的数据，留下可回看的来源信息。',
            output: 'raw_core + raw_credit',
          },
          {
            id: 'standardized-data',
            label: '统一整理',
            title: '对齐明细和机构',
            detail: '统一字段和机构标识，形成可供多个下游使用的明细。',
            output: 'banking_detail',
          },
          {
            id: 'shared-data',
            label: '公共加工',
            title: '沉淀共享结果',
            detail: '汇总存款、贷款并计算存贷比，下游只消费已经整理好的结果。',
            output: 'branch_ratio',
          },
        ],
      },
    },
    {
      kind: 'narrative',
      title: '层名可以变，职责要说清楚',
      paragraphs: [
        '分层的本质是把不同工作放到合适的位置：原始数据负责留住来源，统一整理负责让字段和机构可比较，公共加工负责沉淀重复使用的规则，下游服务负责适配报表、指标或 API 的具体需要。',
        '不同企业、不同银行的层级数量和命名并不统一。ODS、DWD、DWS、ADS 可以作为一种常见命名方式，但真正需要确认的是每一层承担什么职责，以及哪一份结果可以被复用。',
      ],
      bullets: [
        '公共规则只维护一份，减少不同下游各算各的结果。',
        '来源字段变化时，先在接入或整理职责中处理，减少变化向报表扩散。',
        '应用层可以按使用方式组织，不必把应用需求倒灌到所有公共数据中。',
      ],
    },
    {
      kind: 'takeaway',
      title: '职责比层名更重要',
      text: '分层不是为了凑出几张表，而是为了让保存、整理、复用和服务各有边界。只要职责清楚，团队才有依据决定哪里保留原始数据、哪里沉淀公共规则、哪里适配具体应用。',
      bullets: [
        '分层减少重复抽取和重复计算。',
        '公共加工让同一个指标规则可以复用。',
        '清楚的边界可以控制字段和规则变化的影响范围。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把四个缩写当成唯一答案',
      text: 'ODS / DWD / DWS / ADS 只是常见的层名组合。企业可能合并、拆分或使用其他命名；判断一层是否合理，要看它是否有清楚职责和真实复用价值。',
    },
  ],
}
