import type { LessonContent } from '../types'
import type {
  BankingMetricDefinitionStage,
  BankingMetricDefinitionVisualization,
} from '../../types'

export const depositMetricDefinitionStages: BankingMetricDefinitionStage[] = [
  {
    id: 'name-only',
    label: '只写名称',
    description: '先记录业务方说出的名字，其他字段暂时留空。',
    definition: {
      name: '存款余额',
      businessMeaning: '统计范围尚未写清楚。',
      statisticTime: '待补充',
      subject: '待补充',
      measure: '待补充',
      customerScope: '待补充',
      productScope: '待补充',
      branch: '待补充',
      currency: '待补充',
      unit: '待补充',
      requiredFilters: '待补充',
      grain: '待补充',
    },
  },
  {
    id: 'whole-bank',
    label: '补齐全行范围',
    description: '把日期、对象、基础度量和共同范围写出来，形成可以讨论的版本。',
    definition: {
      name: '全行人民币存款余额',
      businessMeaning: '统计日末，全行符合范围的人民币存款账户余额合计。',
      statisticTime: '截至 2026-09-30',
      subject: 'Account（账户）',
      measure: 'balance（余额）',
      customerScope: '全部客户',
      productScope: '活期、定期、协定、保证金',
      branch: '全行',
      currency: 'CNY（人民币）',
      unit: '元',
      requiredFilters: 'snapshot_date = 2026-09-30；account_status = ACTIVE',
      grain: 'Account × snapshot_date（一行代表一个账户在统计日的余额状态）',
    },
  },
  {
    id: 'specific-scope',
    label: '补齐业务范围',
    description: '把一个具体分行、客户标签和产品范围补上，定义就能交给工程师复算。',
    definition: {
      name: '杭州分行小微口径人民币定期存款余额',
      businessMeaning: '统计日末，杭州分行小微口径客户的人民币定期账户余额合计。',
      statisticTime: '2026-09-30',
      subject: 'Account（账户）',
      measure: 'balance（余额）',
      customerScope: '小微口径',
      productScope: '定期',
      branch: '杭州分行',
      currency: 'CNY（人民币）',
      unit: '元',
      requiredFilters: 'snapshot_date = 2026-09-30；account_status = ACTIVE',
      grain: 'Account × snapshot_date（一行代表一个账户在统计日的余额状态）',
    },
  },
]

export const depositMetricDefinitionVisualization: BankingMetricDefinitionVisualization = {
  kind: 'banking-metric-definition' as const,
  stages: depositMetricDefinitionStages,
}

export const depositMetricDefinitionContent: LessonContent = {
  eyebrow: '第 03 章 · 指标定义卡',
  subtitle: '“存款余额”只是一个名字；把时间、对象、度量和范围补齐，别人才能复述并复算它。',
  quickSummary:
    '用一张轻量定义卡，把“存款余额”逐步补成全行口径，再补成“杭州分行小微口径人民币定期存款余额”，同时标出 Account × snapshot_date 的底层 Grain。',
  concept: {
    term: '指标定义卡',
    definition:
      '指标定义卡用少量固定字段记录业务含义、统计时间、统计对象、度量、范围、单位、必要过滤条件和底层 Grain，不把它扩展成企业级指标平台 Schema。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '只写“存款余额”，工程师还不知道该算什么',
      paragraphs: [
        '“存款余额”至少还缺少一个日期、一个统计对象和一组范围条件。是统计某个账户，还是全行账户？是 2026-09-30 的状态，还是某段时间发生的存入交易？这些问题不写在定义里，就只能靠每个人自己的理解补齐。',
        '定义卡不需要收录所有平台元数据。此处只保留一位数据工程师开始加工前必须知道的字段。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '定义卡实验 · 逐项补全',
      title: '从一个名字补成一份可复算的定义',
      description:
        '点击三个阶段，观察定义卡怎样补上统计时间、统计对象、度量、客户口径、产品口径、机构范围、币种、单位、必要过滤条件和底层 Grain。',
      visualization: depositMetricDefinitionVisualization,
    },
    {
      kind: 'narrative',
      title: 'Grain 只需要在这里点明它的作用',
      paragraphs: [
        '第 02 章已经讨论过 Grain。这里不重新讲事实表设计，只确认指标依赖的输入行：如果底层是一行一个账户在一个快照日的状态，那么余额可以按账户快照汇总；如果把交易事件直接当成余额，就换了业务过程。',
        '当定义写成“Account × snapshot_date + balance”，工程师可以继续追问快照来源、状态过滤和范围条件，而不是猜“存款余额”四个字的含义。',
      ],
    },
    {
      kind: 'takeaway',
      title: '一张够用的指标定义卡',
      text: '指标名称越具体，参与统计的集合越容易被复述。这张卡保留加工前必须知道的条件：统计哪一天、统计谁、加什么度量，以及哪些记录不该进入集合。',
      bullets: [
        '业务含义：统计日末的账户余额合计。',
        '统计对象和 Grain：Account × snapshot_date。',
        '范围：客户、产品、机构、币种和必要过滤条件。',
        '单位：元；名称、条件和结果能够互相对上。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要为了“完整”堆企业级字段',
      text: '本章的定义卡只服务于口径复述和后续加工。字段只保留与当前问题直接相关的业务条件，不把定义卡扩展成一套平台管理表单。',
    },
  ],
}
