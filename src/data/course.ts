import { DEFAULT_LOCALE, type Locale } from '../i18n/locale'
import { getMessage } from '../i18n/messages'
import { sortLessons } from '../utils/lesson'

export type LessonDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type LessonDemo =
  | 'systems'
  | 'layers'
  | 'lineage'
  | 'modeling-intro'
  | 'loan-business-process'
  | 'loan-grain'
  | 'banking-star-schema'
  | 'banking-fact-types'
  | 'banking-customer-history'
  | 'star-schema'
  | 'scd'
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
    estimatedMinutes: 8,
    demo: 'systems',
  },
  {
    id: 'lesson-02',
    slug: 'warehouse-layers',
    chapter: '02',
    order: 100,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'layers',
  },
  {
    id: 'lesson-03',
    slug: 'data-modeling',
    chapter: '03',
    order: 100,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'loan-business-process',
  },
  {
    id: 'lesson-grain',
    slug: 'grain',
    chapter: '03',
    order: 200,
    difficulty: 'beginner',
    estimatedMinutes: 12,
    demo: 'loan-grain',
  },
  {
    id: 'lesson-04',
    slug: 'metric-system',
    chapter: '04',
    order: 100,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'banking-metric-scope',
  },
  {
    id: 'lesson-metric-definition',
    slug: 'deposit-metric-definition',
    chapter: '04',
    order: 200,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'banking-metric-definition',
  },
  {
    id: 'lesson-metric-time',
    slug: 'deposit-metric-time',
    chapter: '04',
    order: 300,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'banking-metric-time',
  },
  {
    id: 'lesson-metric-derivations',
    slug: 'deposit-metric-derivations',
    chapter: '04',
    order: 400,
    difficulty: 'beginner',
    estimatedMinutes: 12,
    demo: 'banking-metric-derivations',
  },
  {
    id: 'lesson-05',
    slug: 'sql-and-transformation',
    chapter: '05',
    order: 100,
    difficulty: 'intermediate',
    estimatedMinutes: 15,
    demo: 'sql-transformation',
  },
  {
    id: 'lesson-06',
    slug: 'scheduling-system',
    chapter: '06',
    order: 100,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'scheduler',
  },
  {
    id: 'lesson-07',
    slug: 'data-quality',
    chapter: '07',
    order: 100,
    difficulty: 'intermediate',
    estimatedMinutes: 8,
    demo: 'data-quality',
  },
  {
    id: 'lesson-07-rules',
    slug: 'data-quality-rules',
    chapter: '07',
    order: 200,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'data-quality',
  },
  {
    id: 'lesson-07-dataset',
    slug: 'data-quality-dataset',
    chapter: '07',
    order: 300,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'data-quality',
  },
  {
    id: 'lesson-07-evidence',
    slug: 'data-quality-evidence',
    chapter: '07',
    order: 400,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'data-quality',
  },
  {
    id: 'lesson-07-release',
    slug: 'data-quality-release',
    chapter: '07',
    order: 500,
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    demo: 'data-quality',
  },
  {
    id: 'lesson-08',
    slug: 'data-lineage',
    chapter: '08',
    order: 100,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'lineage',
  },
  {
    id: 'lesson-star-schema-grain',
    slug: 'star-schema-and-grain',
    chapter: '03',
    order: 300,
    difficulty: 'beginner',
    estimatedMinutes: 14,
    demo: 'banking-star-schema',
  },
  {
    id: 'lesson-fact-table-types',
    slug: 'fact-table-types',
    chapter: '03',
    order: 400,
    difficulty: 'beginner',
    estimatedMinutes: 14,
    demo: 'banking-fact-types',
  },
  {
    id: 'lesson-scd-type-2',
    slug: 'slowly-changing-dimension',
    chapter: '03',
    order: 500,
    difficulty: 'beginner',
    estimatedMinutes: 14,
    demo: 'banking-customer-history',
  },
  {
    id: 'lesson-09',
    slug: 'data-governance',
    chapter: '09',
    order: 100,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    demo: 'governance',
  },
  {
    id: 'lesson-10',
    slug: 'lakehouse',
    chapter: '10',
    order: 100,
    difficulty: 'advanced',
    estimatedMinutes: 18,
    demo: 'lakehouse',
  },
  {
    id: 'lesson-11',
    slug: 'performance-and-practice',
    chapter: '11',
    order: 100,
    difficulty: 'advanced',
    estimatedMinutes: 15,
    demo: 'performance-lab',
  },
  {
    id: 'lesson-12',
    slug: 'build-a-warehouse',
    chapter: '12',
    order: 100,
    difficulty: 'advanced',
    estimatedMinutes: 20,
    demo: 'coming-soon',
  },
] as const satisfies readonly LessonDefinition[]

export type LessonId = (typeof lessonDefinitions)[number]['id']

/** Only zh-CN is maintained for now; add another locale here when its copy exists. */
export const chapterTranslations: Partial<Record<Locale, Record<ChapterId, ChapterTranslation>>> = {
  'zh-CN': {
    '01': { title: '数据仓库是什么' },
    '02': { title: '数据仓库分层' },
    '03': { title: '数据建模' },
    '04': { title: '指标体系' },
    '05': { title: 'SQL 与数据加工' },
    '06': { title: '调度系统' },
    '07': { title: '数据质量' },
    '08': { title: '数据血缘' },
    '09': { title: '数据治理' },
    '10': { title: '湖仓' },
    '11': { title: '性能与工程实践' },
    '12': { title: '从 0 搭一套数据仓库' },
  },
}

export const lessonTranslations: Partial<Record<Locale, Record<LessonId, LessonTranslation>>> = {
  'zh-CN': {
    'lesson-01': {
      title: '为什么需要数据仓库？',
      summary: '从订单、用户、商品和支付四本业务账开始，理解分析系统为何需要独立的数据空间。',
      tags: ['基础概念', 'OLTP', 'OLAP'],
    },
    'lesson-02': {
      title: '数据仓库为什么需要分层？',
      summary: '观察一条订单数据如何经过 ODS、DWD、DWS，最后服务于 ADS。',
      tags: ['分层', '数据流', '加工'],
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
      title: 'SQL 与数据加工',
      summary: '一段 SQL 结果翻倍时，沿表快照排查粒度、关联和聚合顺序。',
      tags: ['SQL', 'ETL', '粒度', '数据加工'],
    },
    'lesson-06': {
      title: '调度系统：数据任务如何按时到达？',
      summary:
        '从 06:00 日批到迟到补数，理解任务依赖、运行状态、SLA 与业务分区如何决定报表何时可用。',
      tags: ['DAG', '调度', '重跑'],
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
      title: '什么是数据血缘？',
      summary: '沿表、字段、任务和指标的依赖关系，判断一次变更会影响哪些下游结果。',
      tags: ['血缘', '影响分析'],
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
    'lesson-09': {
      title: '数据治理：当数据平台开始失控',
      summary:
        '新员工申请用户销售数据时，比较资产定义、字段权限、责任人和生命周期，留下可追溯的使用决定。',
      tags: ['治理', '资产目录', '决策台', '血缘影响'],
    },
    'lesson-10': {
      title: '湖仓：为什么数据湖最终需要仓库能力',
      summary:
        '同一份订单、事件和 JSON 文件面对稳定报表、探索分析和 ML 时，比较三种架构的能力与代价。',
      tags: ['湖仓', '架构切换', '版本'],
    },
    'lesson-11': {
      title: '性能与工程实践',
      summary: '从一次日报超时入手，比较分区裁剪、数据倾斜、文件布局和复用策略的收益与代价。',
      tags: ['性能', '工程'],
    },
    'lesson-12': {
      title: '从 0 搭一套数据仓库',
      summary: '围绕一个业务问题设计事实表、指标、质量检查和运行链路，形成可维护的数据产品。',
      tags: ['实践', '项目'],
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
