import type { LessonContent } from '../types'

export const warehouseTermsContent: LessonContent = {
  eyebrow: '第 01 章 · 1-4 术语收口',
  subtitle: '把前面走过的业务场景翻译成行业语言，知道每个词在回答哪一种工程问题。',
  quickSummary:
    '沿着转账、夜间同步和趋势查询三个场景，区分 OLTP、ETL / ELT、OLAP 与 Data Warehouse 各自描述的对象。',
  concept: {
    term: 'Data Warehouse（数据仓库）',
    definition:
      '承接多来源数据并组织成分析数据的系统或数据空间，供查询、汇总、指标和报表等分析工作使用。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '同一条链路里，词语回答的角度不同',
      paragraphs: [
        '前面已经看到：核心系统和信贷系统保存业务事实，数据被抽取并整理到数据仓库，最后由报表查询存贷比。现在给这条链路贴术语时，先问每个词描述的是系统负载、数据处理方式，还是分析数据的承载位置。',
        'OLTP 和 OLAP 更接近“系统在承受什么样的工作”；ETL 和 ELT 描述“数据怎样被抽取、加工和装载”；Data Warehouse 描述“整合后的分析数据放在哪里”。它们可以同时出现在一条链路中，但关注点不同。',
      ],
      bullets: [
        '核心系统、信贷系统通常承受更偏 OLTP 的交易负载。',
        '数据抽取、加工和装载可以采用 ETL 或 ELT 的顺序。',
        '数据仓库承载整合后的分析数据，查询和汇总更偏 OLAP。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '术语翻译实验 · 按问题找到对应的词',
      title: '先看问题，再记英文全称',
      description:
        '术语卡按三个问题分组，避免把不同维度的词排成一张并列清单。再选择现场场景，检查自己的判断。',
      visualization: {
        kind: 'warehouse-terms',
        terms: [
          {
            id: 'oltp',
            group: 'workload',
            groupLabel: '系统负载：系统在处理什么',
            term: 'OLTP',
            chinese: '在线事务处理',
            fullName: 'Online Transaction Processing',
            solves: '关注一笔业务能否快速、准确地写入并保持事务状态。',
            relation: '描述系统负载和工作方式',
          },
          {
            id: 'olap',
            group: 'workload',
            groupLabel: '系统负载：系统在处理什么',
            term: 'OLAP',
            chinese: '在线分析处理',
            fullName: 'Online Analytical Processing',
            solves: '关注跨表查询、历史对比、分组汇总和趋势分析。',
            relation: '描述系统负载和工作方式',
          },
          {
            id: 'etl',
            group: 'processing',
            groupLabel: '数据处理：数据怎样移动',
            term: 'ETL',
            chinese: '抽取、转换、装载',
            fullName: 'Extract, Transform, Load',
            solves: '先从来源抽取数据，在装载到目标位置前完成主要转换。',
            relation: '描述加工顺序',
          },
          {
            id: 'elt',
            group: 'processing',
            groupLabel: '数据处理：数据怎样移动',
            term: 'ELT',
            chinese: '抽取、装载、转换',
            fullName: 'Extract, Load, Transform',
            solves: '先把数据装载到分析平台，再利用平台能力完成转换。',
            relation: '描述加工顺序',
          },
          {
            id: 'data-warehouse',
            group: 'platform',
            groupLabel: '分析承载：整合后的数据放在哪里',
            term: 'Data Warehouse',
            chinese: '数据仓库',
            fullName: 'Data Warehouse',
            solves: '承接多来源数据，保存整理后的分析数据和可复用结果。',
            relation: '描述分析数据的承载空间',
          },
        ],
        scenarios: [
          {
            id: 'transfer',
            label: '客户完成一次转账',
            prompt: '这更接近哪类工作？',
            answerLabel: 'OLTP · 在线事务处理',
            answerTermIds: ['oltp'],
            explanation:
              '转账需要业务系统及时写入账户变化，并保证这笔事务的状态一致。它关注单笔业务的正确处理。',
          },
          {
            id: 'nightly-sync',
            label: '每晚同步业务数据',
            prompt: '这更接近哪类工作？',
            answerLabel: 'ETL / ELT · 数据处理方式',
            answerTermIds: ['etl', 'elt'],
            explanation:
              '夜间同步描述数据从来源进入分析平台的过程，团队可以先转换再装载，也可以先装载再转换，选择取决于平台和加工边界。',
          },
          {
            id: 'trend-query',
            label: '查询过去一年经营趋势',
            prompt: '这更接近哪类工作？',
            answerLabel: 'OLAP · 在线分析处理',
            answerTermIds: ['olap', 'data-warehouse'],
            explanation:
              '过去一年趋势查询通常需要扫描历史数据、分组汇总并比较时间变化，属于分析负载，常在数据仓库等分析数据空间中完成。',
          },
        ],
      },
    },
    {
      kind: 'narrative',
      title: '把术语放回杭州分行存贷比',
      paragraphs: [
        '杭州分行存贷比的链路里，核心系统和信贷系统承担各自的业务交易负载，通常更偏 OLTP；抽取两边数据并进行整理时，采用 ETL 还是 ELT 是加工顺序的选择；整理后的数据进入 Data Warehouse，经营人员查询 90 ÷ 120 = 75% 时，承受的是 OLAP 分析负载。',
        '这样看，术语是一组不同角度的工程标签。知道它解决哪一个问题，比把五个缩写背成同一类名词更有用。',
      ],
      bullets: [
        'OLTP / OLAP：描述工作负载和查询方式。',
        'ETL / ELT：描述数据处理的先后顺序。',
        'Data Warehouse：描述整合后分析数据的承载位置。',
      ],
    },
    {
      kind: 'takeaway',
      title: '术语要跟着问题使用',
      text: '遇到一个新词时，先判断它在说明系统负载、数据处理方式，还是分析数据空间。这样以后看到 OLTP、OLAP、ETL、ELT 和 Data Warehouse，能把它们放回真实链路，而不只是记住英文全称。',
      bullets: [
        '核心系统和信贷系统更偏 OLTP。',
        '数据抽取加工可以采用 ETL 或 ELT。',
        '数据仓库承载分析数据，趋势查询更偏 OLAP。',
      ],
    },
    {
      kind: 'pitfall',
      title: '本章先不展开的词',
      text: '本章先把跨系统分析、数据职责和报表链路看完整；更多数据加工和建模概念，放到后续课程的具体问题中再展开。',
    },
  ],
}
