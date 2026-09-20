import { DEFAULT_LOCALE, type Locale } from '../i18n/locale'
import { getMessage } from '../i18n/messages'
import { sortLessons } from '../utils/lesson'

export type LessonDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type LessonDemo =
  | 'systems'
  | 'layers'
  | 'layer-evolution'
  | 'report-metric-journey'
  | 'warehouse-terms'
  | 'lineage'
  | 'loan-business-process'
  | 'loan-grain'
  | 'banking-star-schema'
  | 'banking-fact-types'
  | 'banking-customer-history'
  | 'star-schema'
  | 'metric-definition'
  | 'banking-metric-scope'
  | 'banking-metric-definition'
  | 'banking-metric-time'
  | 'banking-metric-derivations'
  | 'lakehouse'
  | 'sql-transformation'
  | 'governance'
  | 'performance-lab'
  | 'scheduler'
  | 'data-quality'
  | 'data-service'
  | 'capstone'
  | 'lifecycle-path'
  | 'coming-soon'

/** Language-neutral fields that identify and arrange a lesson. */
export interface LessonDefinition {
  id: string
  slug: string
  chapter: ChapterId
  /** Chapter-local sorting weight; the UI always derives the displayed number from it. */
  order: number
  difficulty: LessonDifficulty
  estimatedMinutes: number
  demo: LessonDemo
}

/**
 * Single source of truth for "is this lesson online?".
 *
 * The home page, the README course facts test and the release gate all derive
 * lesson counts from this predicate instead of re-implementing it.
 */
export function isLessonAvailable(lesson: Pick<LessonDefinition, 'demo'>): boolean {
  return lesson.demo !== 'coming-soon'
}

/** Display text for one lesson in a specific locale. */
export interface LessonTranslation {
  title: string
  summary: string
  tags: string[]
}

/** A lesson definition resolved with the requested locale's display text. */
export type LocalizedLesson = LessonDefinition & LessonTranslation

/** Backward-compatible name used by existing course and progress consumers. */
export type Lesson = LocalizedLesson

export interface ChapterDefinition {
  id: string
}

export interface ChapterTranslation {
  title: string
}

export interface Chapter extends ChapterDefinition, ChapterTranslation {
  lessons: Lesson[]
}

export const chapterDefinitions = [
  { id: '01' },
  { id: '02' },
  { id: '03' },
  { id: '04' },
  { id: '05' },
  { id: '06' },
  { id: '07' },
  { id: '08' },
  { id: '09' },
  { id: '10' },
  { id: '11' },
  { id: '12' },
  { id: '13' },
] as const satisfies readonly ChapterDefinition[]

export type ChapterId = (typeof chapterDefinitions)[number]['id']

/** Course structure and stable lesson metadata; no locale-specific copy lives here. */
export const lessonDefinitions = [
  {
    id: 'lesson-01',
    slug: 'why-data-warehouse',
    chapter: '01',
    order: 100,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'systems',
  },
  {
    id: 'lesson-02',
    slug: 'warehouse-layers',
    chapter: '01',
    order: 200,
    difficulty: 'beginner',
    estimatedMinutes: 12,
    demo: 'layer-evolution',
  },
  {
    id: 'lesson-01-report-journey',
    slug: 'report-metric-journey',
    chapter: '01',
    order: 300,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'report-metric-journey',
  },
  {
    id: 'lesson-01-terms',
    slug: 'warehouse-terms',
    chapter: '01',
    order: 400,
    difficulty: 'beginner',
    estimatedMinutes: 12,
    demo: 'warehouse-terms',
  },
  {
    id: 'lesson-03',
    slug: 'data-modeling',
    chapter: '02',
    order: 100,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'loan-business-process',
  },
  {
    id: 'lesson-grain',
    slug: 'grain',
    chapter: '02',
    order: 200,
    difficulty: 'beginner',
    estimatedMinutes: 12,
    demo: 'loan-grain',
  },
  {
    id: 'lesson-04',
    slug: 'metric-system',
    chapter: '03',
    order: 100,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'banking-metric-scope',
  },
  {
    id: 'lesson-metric-definition',
    slug: 'deposit-metric-definition',
    chapter: '03',
    order: 200,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'banking-metric-definition',
  },
  {
    id: 'lesson-metric-time',
    slug: 'deposit-metric-time',
    chapter: '03',
    order: 300,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'banking-metric-time',
  },
  {
    id: 'lesson-metric-derivations',
    slug: 'deposit-metric-derivations',
    chapter: '03',
    order: 400,
    difficulty: 'beginner',
    estimatedMinutes: 12,
    demo: 'banking-metric-derivations',
  },
  {
    id: 'lesson-05',
    slug: 'sql-and-transformation',
    chapter: '04',
    order: 100,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'sql-transformation',
  },
  {
    id: 'lesson-05-cleaning',
    slug: 'sql-transformation-cleaning',
    chapter: '04',
    order: 200,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'sql-transformation',
  },
  {
    id: 'lesson-05-join',
    slug: 'sql-transformation-join',
    chapter: '04',
    order: 300,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'sql-transformation',
  },
  {
    id: 'lesson-05-layers',
    slug: 'sql-transformation-layers',
    chapter: '04',
    order: 400,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'sql-transformation',
  },
  {
    id: 'lesson-05-contract',
    slug: 'sql-transformation-contract',
    chapter: '04',
    order: 500,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'sql-transformation',
  },
  {
    id: 'lesson-06',
    slug: 'scheduling-system',
    chapter: '05',
    order: 100,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'scheduler',
  },
  {
    id: 'lesson-scheduling-readiness',
    slug: 'scheduling-readiness',
    chapter: '05',
    order: 200,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'scheduler',
  },
  {
    id: 'lesson-scheduling-failure',
    slug: 'scheduling-failure',
    chapter: '05',
    order: 300,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'scheduler',
  },
  {
    id: 'lesson-scheduling-rerun',
    slug: 'scheduling-rerun',
    chapter: '05',
    order: 400,
    difficulty: 'intermediate',
    estimatedMinutes: 14,
    demo: 'scheduler',
  },
  {
    id: 'lesson-scheduling-sla',
    slug: 'scheduling-sla',
    chapter: '05',
    order: 500,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'scheduler',
  },
  {
    id: 'lesson-07',
    slug: 'data-quality',
    chapter: '06',
    order: 100,
    difficulty: 'intermediate',
    estimatedMinutes: 8,
    demo: 'data-quality',
  },
  {
    id: 'lesson-07-rules',
    slug: 'data-quality-rules',
    chapter: '06',
    order: 200,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'data-quality',
  },
  {
    id: 'lesson-07-dataset',
    slug: 'data-quality-dataset',
    chapter: '06',
    order: 300,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'data-quality',
  },
  {
    id: 'lesson-07-evidence',
    slug: 'data-quality-evidence',
    chapter: '06',
    order: 400,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'data-quality',
  },
  {
    id: 'lesson-07-release',
    slug: 'data-quality-release',
    chapter: '06',
    order: 500,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'data-quality',
  },
  {
    id: 'lesson-08',
    slug: 'data-lineage',
    chapter: '07',
    order: 100,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'lineage',
  },
  {
    id: 'lesson-08-fields',
    slug: 'data-lineage-fields',
    chapter: '07',
    order: 200,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'lineage',
  },
  {
    id: 'lesson-08-investigation',
    slug: 'data-lineage-investigation',
    chapter: '07',
    order: 300,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'lineage',
  },
  {
    id: 'lesson-08-impact',
    slug: 'data-lineage-impact',
    chapter: '07',
    order: 400,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'lineage',
  },
  {
    id: 'lesson-08-evidence',
    slug: 'data-lineage-evidence',
    chapter: '07',
    order: 500,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'lineage',
  },
  {
    id: 'lesson-star-schema-grain',
    slug: 'star-schema-and-grain',
    chapter: '02',
    order: 300,
    difficulty: 'beginner',
    estimatedMinutes: 14,
    demo: 'banking-star-schema',
  },
  {
    id: 'lesson-fact-table-types',
    slug: 'fact-table-types',
    chapter: '02',
    order: 400,
    difficulty: 'beginner',
    estimatedMinutes: 14,
    demo: 'banking-fact-types',
  },
  {
    id: 'lesson-scd-type-2',
    slug: 'slowly-changing-dimension',
    chapter: '02',
    order: 500,
    difficulty: 'beginner',
    estimatedMinutes: 14,
    demo: 'banking-customer-history',
  },
  {
    id: 'lesson-09-1',
    slug: 'data-governance',
    chapter: '08',
    order: 100,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'governance',
  },
  {
    id: 'lesson-09-2',
    slug: 'data-governance-evidence',
    chapter: '08',
    order: 200,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'governance',
  },
  {
    id: 'lesson-09-3',
    slug: 'data-governance-field-access',
    chapter: '08',
    order: 300,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'governance',
  },
  {
    id: 'lesson-09-4',
    slug: 'data-governance-lifecycle',
    chapter: '08',
    order: 400,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'governance',
  },
  {
    id: 'lesson-09-5',
    slug: 'data-governance-change-responsibility',
    chapter: '08',
    order: 500,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'governance',
  },
  {
    id: 'lesson-10',
    slug: 'lakehouse',
    chapter: '09',
    order: 100,
    difficulty: 'advanced',
    estimatedMinutes: 16,
    demo: 'lakehouse',
  },
  {
    id: 'lesson-10-replication',
    slug: 'lakehouse-replication',
    chapter: '09',
    order: 200,
    difficulty: 'advanced',
    estimatedMinutes: 14,
    demo: 'lakehouse',
  },
  {
    id: 'lesson-10-table-layer',
    slug: 'lakehouse-table-layer',
    chapter: '09',
    order: 300,
    difficulty: 'advanced',
    estimatedMinutes: 16,
    demo: 'lakehouse',
  },
  {
    id: 'lesson-10-unity',
    slug: 'lakehouse-unity',
    chapter: '09',
    order: 400,
    difficulty: 'advanced',
    estimatedMinutes: 14,
    demo: 'lakehouse',
  },
  {
    id: 'lesson-data-service',
    slug: 'data-service',
    chapter: '10',
    order: 100,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'data-service',
  },
  {
    id: 'lesson-data-service-report',
    slug: 'data-service-report',
    chapter: '10',
    order: 200,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'data-service',
  },
  {
    id: 'lesson-data-service-file',
    slug: 'data-service-file',
    chapter: '10',
    order: 300,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'data-service',
  },
  {
    id: 'lesson-data-service-api',
    slug: 'data-service-api',
    chapter: '10',
    order: 400,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'data-service',
  },
  {
    id: 'lesson-data-service-choice',
    slug: 'data-service-choice',
    chapter: '10',
    order: 500,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'data-service',
  },
  {
    id: 'lesson-11',
    slug: 'performance-and-practice',
    chapter: '11',
    order: 100,
    difficulty: 'advanced',
    estimatedMinutes: 12,
    demo: 'performance-lab',
  },
  {
    id: 'lesson-11-scan-layout',
    slug: 'performance-scan-layout',
    chapter: '11',
    order: 200,
    difficulty: 'advanced',
    estimatedMinutes: 14,
    demo: 'performance-lab',
  },
  {
    id: 'lesson-11-shuffle-skew',
    slug: 'performance-shuffle-skew',
    chapter: '11',
    order: 300,
    difficulty: 'advanced',
    estimatedMinutes: 14,
    demo: 'performance-lab',
  },
  {
    id: 'lesson-11-first-seen',
    slug: 'performance-first-seen',
    chapter: '11',
    order: 400,
    difficulty: 'advanced',
    estimatedMinutes: 16,
    demo: 'performance-lab',
  },
  {
    id: 'lesson-11-tradeoffs',
    slug: 'performance-tradeoffs',
    chapter: '11',
    order: 500,
    difficulty: 'advanced',
    estimatedMinutes: 16,
    demo: 'performance-lab',
  },
  {
    id: 'lesson-12',
    slug: 'build-a-warehouse',
    chapter: '12',
    order: 100,
    difficulty: 'advanced',
    estimatedMinutes: 35,
    demo: 'capstone',
  },
  {
    id: 'lesson-13-1',
    slug: 'lifecycle-path-failure',
    chapter: '13',
    order: 100,
    difficulty: 'advanced',
    estimatedMinutes: 18,
    demo: 'lifecycle-path',
  },
] as const satisfies readonly LessonDefinition[]

export type LessonId = (typeof lessonDefinitions)[number]['id']

/** Only zh-CN is maintained for now; add another locale here when its copy exists. */
export const chapterTranslations: Partial<Record<Locale, Record<ChapterId, ChapterTranslation>>> = {
  'zh-CN': {
    '01': { title: '认识数据仓库' },
    '02': { title: '数据建模' },
    '03': { title: '指标体系' },
    '04': { title: 'SQL 与数据加工' },
    '05': { title: '调度系统' },
    '06': { title: '数据质量' },
    '07': { title: '数据血缘' },
    '08': { title: '数据治理' },
    '09': { title: '湖仓' },
    '10': { title: '数据服务' },
    '11': { title: '性能与工程实践' },
    '12': { title: '跨系统分行经营分析数据产品' },
    '13': { title: '生产实践案例' },
  },
}

export const lessonTranslations: Partial<Record<Locale, Record<LessonId, LessonTranslation>>> = {
  'zh-CN': {
    'lesson-01': {
      title: '为什么有业务系统，还需要数据仓库？',
      summary: '用核心系统与信贷系统的存贷比案例，理解跨系统经营分析为什么需要数据仓库。',
      tags: ['跨系统分析', '数据仓库', '存贷比'],
    },
    'lesson-02': {
      title: '为什么数据要分层？',
      summary: '从一个存贷比报表扩展到日报、驾驶舱和 API，观察公共加工如何减少重复处理。',
      tags: ['数据职责', '公共复用', '变化影响'],
    },
    'lesson-01-report-journey': {
      title: '一个报表数字是怎么来的？',
      summary: '沿杭州分行存贷比的七个步骤，完整回看源系统、数据仓库和经营报表之间的链路。',
      tags: ['数据链路', '存贷比', '报表'],
    },
    'lesson-01-terms': {
      title: '这些数仓术语到底在说什么？',
      summary:
        '把 OLTP、OLAP、ETL、ELT 和 Data Warehouse 放回前面的业务场景，理解它们各自描述什么。',
      tags: ['OLTP', 'OLAP', 'ETL / ELT'],
    },
    'lesson-03': {
      title: '业务过程：到底要记录哪件事？',
      summary: '从贷款合同、借据和还款链路出发，先确定分析要记录的业务过程。',
      tags: ['业务过程', '贷款建模'],
    },
    'lesson-grain': {
      title: 'Grain：一行究竟代表什么？',
      summary: '用一份贷款合同下的借据与还款记录，切换三种 Grain，避免 Join 放大金额。',
      tags: ['Grain', '粒度', 'Join'],
    },
    'lesson-04': {
      title: '同一个“存款余额”，为什么会有不同答案？',
      summary: '用三个确定性的存款余额结果，理解统计集合不同会造成口径差异。',
      tags: ['指标', '口径', '存款余额'],
    },
    'lesson-metric-definition': {
      title: '一个指标到底由什么组成？',
      summary: '用指标定义卡补齐统计时间、对象、度量、范围、单位和底层 Grain。',
      tags: ['指标定义', '口径', 'Grain'],
    },
    'lesson-metric-time': {
      title: '“截至某天”和“一段时间”有什么区别？',
      summary: '对照存款余额状态与累计存入事件，理解时点和期间两种时间语义。',
      tags: ['时间语义', '快照', '交易事实'],
    },
    'lesson-metric-derivations': {
      title: '一个“存款余额”为什么能派生出这么多指标？',
      summary: '切换客户、产品、币种、机构和日期，观察基础度量如何形成指标族。',
      tags: ['指标派生', '存款余额', '口径组合'],
    },
    'lesson-05': {
      title: '口径已经说清楚，为什么还不能直接算？',
      summary: '从存款余额指标卡列出输入和加工计划，确认结果的一行代表什么。',
      tags: ['指标到加工', '输入设计', '数据粒度'],
    },
    'lesson-05-cleaning': {
      title: '原始输入怎样变成可信明细？',
      summary: '用去重、缺失关联和编码标准化，把账户余额快照整理成可信 DWD 明细。',
      tags: ['DWD', '去重', '关联完整性'],
    },
    'lesson-05-join': {
      title: 'Join 为什么会让金额变大？',
      summary:
        '用账户介质的一对多关系和一个 2 × 2 多对多实验，观察 Join 如何复制度量并改变数据粒度。',
      tags: ['Join', '数据粒度', '金额对账'],
    },
    'lesson-05-layers': {
      title: '从 DWD 到 DWS / ADS，一行发生了什么变化？',
      summary: '沿存款余额加工链观察明细、主题汇总和指标结果的行含义变化。',
      tags: ['DWD', 'DWS', 'ADS', '聚合'],
    },
    'lesson-05-contract': {
      title: '这段加工怎样交给下一环节？',
      summary: '为存款余额加工写下输入、输出、业务日期、分区和重复执行预期。',
      tags: ['加工契约', '业务日期', '分区'],
    },
    'lesson-06': {
      title: '今天凌晨跑的，为什么是昨天的数据？',
      summary: '沿一条存款余额日批时间轴，区分业务日期、到达时间、触发时间和目标分区。',
      tags: ['业务日期', '时间语义', '调度'],
    },
    'lesson-scheduling-readiness': {
      title: '一个任务，到底什么时候才可以开始？',
      summary: '用三种真实运行方式理解 Trigger、输入就绪和任务依赖如何共同决定任务何时启动。',
      tags: ['DAG', '运行条件', '任务依赖'],
    },
    'lesson-scheduling-failure': {
      title: '一个任务失败，后面的任务会怎样？',
      summary: '注入 DWD 故障，观察等待、失败传播、Attempt 和 Retry 如何改变同一条存款余额链。',
      tags: ['失败传播', 'Retry', '状态'],
    },
    'lesson-scheduling-rerun': {
      title: '同样是“再跑一次”，到底有什么不同？',
      summary: '比较 Retry、Rerun、Backfill 和重跑范围，用重复写入反例理解幂等。',
      tags: ['Rerun', 'Backfill', '幂等'],
    },
    'lesson-scheduling-sla': {
      title: '任务都成功了，为什么数据还是可能迟到？',
      summary: '拖动上游到达时间，观察延迟如何传到 ADS，并用业务可用时间判断 SLA。',
      tags: ['SLA', '迟到数据', '业务交付'],
    },
    'lesson-07': {
      title: '任务成功了，数据就可信了吗？',
      summary: '从 Scheduler SUCCESS 和 SLA MET 出发，区分运行状态、质量状态与发布状态。',
      tags: ['质量状态', '调度边界', '发布'],
    },
    'lesson-07-rules': {
      title: '一张表到底应该检查什么？',
      summary:
        '从 Account × snapshot_date 的 Grain 出发，检查记录身份、关键字段、字段语义和对象关系。',
      tags: ['Grain', '质量规则', '存款余额'],
    },
    'lesson-07-dataset': {
      title: '每一行都正常，为什么结果还是可能错？',
      summary: '用应到集合、Freshness 和同口径对账，判断整批数据与加工链是否可信。',
      tags: ['整批完整性', 'Freshness', '对账'],
    },
    'lesson-07-evidence': {
      title: '质量失败以后，我们到底应该看什么？',
      summary: '把规则、目标、期望、观察值和行级或聚合证据组织成可调查的 Quality Event。',
      tags: ['Quality Event', '证据', '调查'],
    },
    'lesson-07-release': {
      title: '发现问题以后，这份数据还能发布吗？',
      summary: '存款余额质量失败默认 BLOCK，并用极小的非关键埋点案例说明 quarantine 的适用条件。',
      tags: ['发布决定', 'BLOCK', 'quarantine'],
    },
    'lesson-08': {
      title: '这份数据到底从哪里来？',
      summary: '沿银行存款余额的表级链路，确认这份数据的直接来源、加工位置和消费去向。',
      tags: ['血缘', '表级关系', '数据来源'],
    },
    'lesson-08-fields': {
      title: '只知道上游表，为什么还不够？',
      summary: '下钻到字段路径，区分余额值、字段重命名、过滤和 JOIN 对结果的不同影响。',
      tags: ['血缘', '字段级依赖', '转换'],
    },
    'lesson-08-investigation': {
      title: '质量告警以后，哪些上游值得先查？',
      summary: '从 Quality Event 命中的对象开始，按近到远调查直接上游和根因候选。',
      tags: ['血缘', '质量调查', '根因候选'],
    },
    'lesson-08-impact': {
      title: '如果这里出问题，会影响哪些下游？',
      summary: '区分直接下游、传递影响和最终消费者，确定一次变更的检查范围。',
      tags: ['血缘', '影响分析', 'Blast Radius'],
    },
    'lesson-08-evidence': {
      title: '图上的这条箭头，凭什么相信？',
      summary: '对照关系证据来源和确认状态，判断一条血缘关系当前能否直接使用。',
      tags: ['血缘', '关系证据', '确认状态'],
    },
    'lesson-star-schema-grain': {
      title: '事实、维度与星型模型',
      summary: '从一笔账户交易推导事实与维度，再切换客户、机构、产品和日期等观察角度。',
      tags: ['事实表', '维度表', '星型模型'],
    },
    'lesson-fact-table-types': {
      title: '事实表不只有一种',
      summary: '用账户交易、日终余额和 LoanNote 生命周期，对照三种事实表的时间语义。',
      tags: ['事实表类型', '快照', '时间语义'],
    },
    'lesson-scd-type-2': {
      title: '维度为什么要保存历史？——拉链表',
      summary: '用客户等级和机构变更，比较覆盖更新与拉链表如何影响历史 LoanNote 的分析结果。',
      tags: ['维度历史', '拉链表', '代理键'],
    },
    'lesson-09-1': {
      title: '搜到三张“存款余额”，我到底该用哪张？',
      summary: '用业务定义、已有 Grain、范围和排除项，对比三类存款余额候选资产。',
      tags: ['治理', '资产发现', 'Grain'],
    },
    'lesson-09-2': {
      title: '找对了资产，今天这份数据真的能用吗？',
      summary: '结合 Quality status 和 Freshness，判断昨天业务日的存款余额是否适合使用。',
      tags: ['治理', 'Quality', 'Freshness'],
    },
    'lesson-09-3': {
      title: '这张表能用，里面的字段都能直接用吗？',
      summary: '按角色和用途勾选最小字段集合，比较直接使用、脱敏和当前不能直接使用。',
      tags: ['治理', '字段使用', '脱敏'],
    },
    'lesson-09-4': {
      title: '旧表还能查到，为什么不应该继续用了？',
      summary: '从 deprecated 旧资产切换到替代资产，理解可访问不等于仍然推荐使用。',
      tags: ['治理', '生命周期', '迁移'],
    },
    'lesson-09-5': {
      title: '字段变了以后，谁需要处理？',
      summary: '读取第 07 章已有影响分析，映射受影响资产 Owner，形成变更责任清单。',
      tags: ['治理', 'Owner', '变更责任'],
    },
    'lesson-10': {
      title: '为什么所有数据先进湖，却只有一部分进入仓？',
      summary:
        '从 Lake-first 链路出发，根据访问频率、查询 SLA 和消费方式判断哪些数据值得进入 Warehouse。',
      tags: ['湖仓', 'Lake-first', '成本取舍'],
    },
    'lesson-10-replication': {
      title: '湖里已经有一份，为什么仓里还要再有一份？',
      summary: '沿异构湖仓的同步链路，理解 Warehouse 副本带来的查询价值、延迟和双体系责任。',
      tags: ['湖仓', '数据复制', '一致性'],
    },
    'lesson-10-table-layer': {
      title: '文件上的数据怎样获得可靠的表能力？',
      summary:
        '用手机银行事件串起 Schema Evolution、Atomic Commit、Snapshot、Version 和 Time Travel。',
      tags: ['Table Layer', 'Schema Evolution', 'Time Travel'],
    },
    'lesson-10-unity': {
      title: '湖仓一体到底“一体”了什么？',
      summary:
        '对照异构体系与共享基础能力，观察 Storage、Table、Metadata、Catalog、Compute 和副本边界。',
      tags: ['湖仓一体', '存算分离', '架构取舍'],
    },
    'lesson-data-service': {
      title: '数据做好了，怎么交给别人用？',
      summary: '从已发布的存款余额出发，认识人查看、系统批量接收和系统按需获取三类消费模式。',
      tags: ['数据服务', '数据消费', '交付边界'],
    },
    'lesson-data-service-report': {
      title: '报表与 BI：给人看的数据',
      summary: '用业务日期和机构筛选查看已发布存款余额，理解报表 / BI 作为受控分析消费者的边界。',
      tags: ['报表', 'BI', '数据消费'],
    },
    'lesson-data-service-file': {
      title: '文件接口：给系统批量交付数据',
      summary: '通过 TXT 数据文件和 FLAG 完成标志，判断一批存款余额什么时候真正可以被下游消费。',
      tags: ['文件接口', 'TXT', 'FLAG'],
    },
    'lesson-data-service-api': {
      title: 'API：让系统按需获取数据',
      summary:
        '用机构和业务日期组成请求，观察 API 如何返回已发布的日终存款余额，并区分访问方式与实时性。',
      tags: ['API', '请求响应', '业务日期'],
    },
    'lesson-data-service-choice': {
      title: '同一份数据，应该怎么交付？',
      summary: '根据消费者、数据量和触发方式选择报表 / BI、文件接口或 API，练习数据交付方式判断。',
      tags: ['消费模式', '方式选择', '数据交付'],
    },
    'lesson-11': {
      title: '任务变慢了，我们先看哪里？',
      summary: '拆开反欺诈 T+1 特征任务的执行阶段，用阶段证据定位主要耗时，再验证一个瓶颈假设。',
      tags: ['性能诊断', 'Scan', 'Stage / Task'],
    },
    'lesson-11-scan-layout': {
      title: '明明过滤了，为什么还是读了这么多数据？',
      summary:
        '用最近 30 天交易对手特征比较 Partition Pruning、小文件、Compaction 和日期分区倾斜。',
      tags: ['Partition Pruning', '文件布局', 'Scan'],
    },
    'lesson-11-shuffle-skew': {
      title: '为什么其他 Task 都结束了，只剩一个迟迟跑不完？',
      summary:
        '用开户机构热点 Key 观察 Worker 长尾，区分日期分区倾斜与 Join / Group By / Shuffle 倾斜。',
      tags: ['Shuffle', '数据倾斜', '最长 Task'],
    },
    'lesson-11-first-seen': {
      title: '为什么“是不是第一次交易”每天都要重新翻历史流水？',
      summary: '从 Transaction 的当日关系出发，引入 first_seen 增量状态和固定 30 天客户日特征。',
      tags: ['业务状态', 'first_seen', 'Grain'],
    },
    'lesson-11-tradeoffs': {
      title: '跑快了，就算优化成功了吗？',
      summary: '用 Before / After、迟到数据和“不值得优化”反例，检查正确性、SLA、成本与维护复杂度。',
      tags: ['工程取舍', 'SLA', 'Freshness'],
    },
    'lesson-12': {
      title: '跨系统分行经营分析数据产品',
      summary:
        '沿一条连续 Mission 串起存款、贷款、调度、质量、血缘、治理、数据服务和性能，完成 Launch Review。',
      tags: ['Capstone', 'Mission', 'Launch Review'],
    },
    'lesson-13-1': {
      title: '上线当天明明成功了，为什么第二天才失败？',
      summary:
        '同一个任务、同一段代码，因为目标对象「不存在 / 已存在」进入两条生命周期路径；用两天证据链定位 maintain.prepare 的规则缺口。',
      tags: ['生产案例', '生命周期路径', '判断链', 'Rerun'],
    },
  },
}

function getTranslation<T, TId extends string>(
  translations: Partial<Record<Locale, Record<TId, T>>>,
  id: TId,
  locale: Locale,
): T {
  const translation = translations[locale]?.[id] ?? translations[DEFAULT_LOCALE]?.[id]

  if (!translation) {
    throw new Error(`Missing ${DEFAULT_LOCALE} translation for "${id}"`)
  }

  return translation
}

export function getLessons(locale: Locale = DEFAULT_LOCALE): Lesson[] {
  return sortLessons(
    lessonDefinitions.map((definition) => ({
      ...definition,
      ...getTranslation(lessonTranslations, definition.id, locale),
    })),
  )
}

export const lessons = getLessons()

export function getChapters(locale: Locale = DEFAULT_LOCALE): Chapter[] {
  const localizedLessons = getLessons(locale)

  return chapterDefinitions.map((definition) => ({
    ...definition,
    ...getTranslation(chapterTranslations, definition.id, locale),
    lessons: localizedLessons.filter((lesson) => lesson.chapter === definition.id),
  }))
}

export const chapters = getChapters()

export function getLessonBySlug(slug: string, locale: Locale = DEFAULT_LOCALE): Lesson | undefined {
  const definition = lessonDefinitions.find((lesson) => lesson.slug === slug)

  return definition
    ? {
        ...definition,
        ...getTranslation(lessonTranslations, definition.id, locale),
      }
    : undefined
}

export function getChapterTitle(chapterId: string, locale: Locale = DEFAULT_LOCALE): string {
  const definition = chapterDefinitions.find((chapter) => chapter.id === chapterId)

  return definition
    ? getTranslation(chapterTranslations, definition.id, locale).title
    : getMessage('lessonContent', locale)
}
