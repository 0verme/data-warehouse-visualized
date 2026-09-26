import type { LessonContent } from '../types'

export const warehouseLayersContent: LessonContent = {
  eyebrow: '第 01 章 · 1-2 公共加工与职责分离',
  subtitle: '先用职责划分减少重复，再观察生产需求如何把理想链路逐步推成依赖网。',
  quickSummary:
    '从存贷比报表的公共加工出发，切换理想结构、多年需求叠加与渐进治理，理解依赖为何变复杂，以及如何逐步收敛。',
  concept: {
    term: '分层的职责',
    definition:
      '把原始接入、统一整理、公共加工和下游服务作为职责边界，便于讨论复用与变更影响。它是设计工具，不保证运行多年的系统始终保持整齐。',
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
      eyebrow: '架构演进实验 · 从职责分层到依赖治理',
      title: '从理想结构切换到生产中的网状依赖',
      description:
        '先比较重复加工与共享加工，再观察历史链路如何叠加，以及如何只优先治理有收益或风险较高的部分。',
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
      title: '为什么运行多年的依赖会长成网？',
      paragraphs: [
        '新的报表、接口和分析目标会陆续加入；系统迁移可能暂时保留旧读取方式；赶交付形成的临时加工也可能被下游继续依赖。它们分别解决了当时的问题，叠加多年后就不再是单一的自上而下链路。',
        '跨层读取应结合消费目标、时效、维护成本和影响范围判断。有的路径是过渡方案，有的可能是稳定的独立消费；图形是否整齐，不能单独证明它该保留或删除。',
      ],
      bullets: [
        '通用工程原理：依赖关系越多，变更影响越需要被发现和说明。',
        '常见做法：记录生产者、消费者、运行依赖和数据时效，便于排障与评估影响。',
        '团队治理选择：是否要求新增链路评审、谁负责例外以及优先级，可按组织风险和交付能力约定。',
      ],
    },
    {
      kind: 'narrative',
      title: '层数不是标准答案，职责和依赖都要说清楚',
      paragraphs: [
        '分层可以把原始接入、统一整理、公共加工和下游服务放在不同职责中，减少重复规则并帮助判断变化影响。实际系统里的依赖则会随需求、迁移和复用逐渐变化。',
        'ODS、DWD、DWS、ADS 是常见命名组合，不代表固定层数或唯一顺序。DWM 或汇总层是否保留，取决于它是否提供重复复用、统一口径或有价值的加工结果；没有相应价值时，也可以不单独建设。',
      ],
      bullets: [
        '共享加工能减少重复口径，但也带来维护和运行成本。',
        '应用出口可以不同；跨层读取要说明原因和影响，不做一概判断。',
        '新链路的约束属于团队治理方式，具体检查项可因风险而异。',
      ],
    },
    {
      kind: 'takeaway',
      title: '不推倒重来，也不放任依赖继续生长',
      text: '理想分层帮助讨论职责，生产系统则需要逐步管理已有依赖。先让新增关系可见，再按影响范围、重复口径和运行风险安排治理；改动旧链路时评估收益与迁移风险，逐条收敛。',
      bullets: [
        '汇总层按复用价值、统一口径和加工收益决定是否存在。',
        '新增依赖可以通过责任、时效和运行关系的约定来管理。',
        '存量不要求一次性重构；低风险路径可保留并持续观察。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把理想图当成生产现状，也别把网状图当成免责理由',
      text: 'ODS / DWD / DWS / ADS 只是常见命名，层数可按职责与价值取舍。跨层关系不自动等于错误，也不代表所有历史链路都无需治理；要结合消费理由、变更影响和维护成本逐步判断。',
    },
  ],
}
