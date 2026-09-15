import { DEFAULT_LOCALE, type Locale } from '../i18n/locale'
import { getMessage } from '../i18n/messages'
import { sortLessons } from '../utils/lesson'

export type LessonDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type LessonDemo =
  | 'systems'
  | 'layers'
  | 'lineage'
  | 'modeling-intro'
  | 'star-schema'
  | 'scd'
  | 'metric-definition'
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
    estimatedMinutes: 12,
    demo: 'modeling-intro',
  },
  {
    id: 'lesson-04',
    slug: 'metric-system',
    chapter: '04',
    order: 100,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    demo: 'metric-definition',
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
    estimatedMinutes: 12,
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
    order: 200,
    difficulty: 'beginner',
    estimatedMinutes: 14,
    demo: 'star-schema',
  },
  {
    id: 'lesson-scd-type-2',
    slug: 'slowly-changing-dimension',
    chapter: '03',
    order: 300,
    difficulty: 'beginner',
    estimatedMinutes: 12,
    demo: 'scd',
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
      title: '数据建模：一张表应该长什么样？',
      summary: '从业务过程、粒度和维度出发，建立可复用的建模思维。',
      tags: ['建模', '粒度'],
    },
    'lesson-04': {
      title: '指标体系：同一个数字为什么不一样？',
      summary: '拆开指标口径、统计粒度与时间范围，理解指标管理的必要性。',
      tags: ['指标', '口径'],
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
      title: '数据质量：怎样知道数据可信？',
      summary: '调度显示成功却少了一行时，用质量规则、失败样本和发布决定定位问题。',
      tags: ['质量', '校验', '证据', '发布闸门'],
    },
    'lesson-08': {
      title: '什么是数据血缘？',
      summary: '沿表、字段、任务和指标的依赖关系，判断一次变更会影响哪些下游结果。',
      tags: ['血缘', '影响分析'],
    },
    'lesson-star-schema-grain': {
      title: '星型模型与粒度',
      summary: '从订单大宽表拆出事实和维度，亲手切换粒度，并看见粒度错误如何让金额重复计算。',
      tags: ['星型模型', '事实表', '粒度'],
    },
    'lesson-scd-type-2': {
      title: '维度为什么要保存历史？SCD Type 2',
      summary:
        '通过一次会员升级，观察直接 UPDATE 如何覆盖历史，并用有效时间区间保留“当时”的维度状态。',
      tags: ['维度历史', 'SCD Type 2', '时间区间'],
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
