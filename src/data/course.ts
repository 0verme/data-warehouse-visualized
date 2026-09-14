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
  | 'coming-soon'

export interface Lesson {
  id: string
  slug: string
  chapter: string
  title: string
  summary: string
  order: number
  difficulty: LessonDifficulty
  estimatedMinutes: number
  tags: string[]
  demo: LessonDemo
}

export interface Chapter {
  id: string
  title: string
  lessons: Lesson[]
}

const chapterDefinitions = [
  ['01', '数据仓库是什么'],
  ['02', '数据仓库分层'],
  ['03', '数据建模'],
  ['04', '指标体系'],
  ['05', 'SQL 与数据加工'],
  ['06', '调度系统'],
  ['07', '数据质量'],
  ['08', '数据血缘'],
  ['09', '数据治理'],
  ['10', '湖仓'],
  ['11', '性能与工程实践'],
  ['12', '从 0 搭一套数据仓库'],
] as const

const lessonDrafts: Lesson[] = [
  {
    id: 'lesson-01',
    slug: 'why-data-warehouse',
    chapter: '01',
    title: '为什么需要数据仓库？',
    summary: '从订单、用户、商品和支付四本业务账开始，理解分析系统为何需要独立的数据空间。',
    order: 1,
    difficulty: 'beginner',
    estimatedMinutes: 8,
    tags: ['基础概念', 'OLTP', 'OLAP'],
    demo: 'systems',
  },
  {
    id: 'lesson-02',
    slug: 'warehouse-layers',
    chapter: '02',
    title: '数据仓库为什么需要分层？',
    summary: '观察一条订单数据如何经过 ODS、DWD、DWS，最后服务于 ADS。',
    order: 2,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    tags: ['分层', '数据流', '加工'],
    demo: 'layers',
  },
  {
    id: 'lesson-03',
    slug: 'data-modeling',
    chapter: '03',
    title: '数据建模：一张表应该长什么样？',
    summary: '从业务过程、粒度和维度出发，建立可复用的建模思维。',
    order: 3,
    difficulty: 'beginner',
    estimatedMinutes: 12,
    tags: ['建模', '粒度'],
    demo: 'modeling-intro',
  },
  {
    id: 'lesson-04',
    slug: 'metric-system',
    chapter: '04',
    title: '指标体系：同一个数字为什么不一样？',
    summary: '拆开指标口径、统计粒度与时间范围，理解指标管理的必要性。',
    order: 6,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    tags: ['指标', '口径'],
    demo: 'metric-definition',
  },
  {
    id: 'lesson-05',
    slug: 'sql-and-transformation',
    chapter: '05',
    title: 'SQL 与数据加工',
    summary: '从明细到汇总，认识 SQL 在数据仓库中的加工角色。',
    order: 7,
    difficulty: 'intermediate',
    estimatedMinutes: 15,
    tags: ['SQL', 'ETL'],
    demo: 'coming-soon',
  },
  {
    id: 'lesson-06',
    slug: 'scheduling-system',
    chapter: '06',
    title: '调度系统：数据任务如何按时到达？',
    summary: '用 DAG 思维理解任务依赖、触发和失败重试。',
    order: 8,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    tags: ['DAG', '调度'],
    demo: 'coming-soon',
  },
  {
    id: 'lesson-07',
    slug: 'data-quality',
    chapter: '07',
    title: '数据质量：怎样知道数据可信？',
    summary: '认识完整性、唯一性、及时性和一致性等质量检查维度。',
    order: 9,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    tags: ['质量', '校验'],
    demo: 'coming-soon',
  },
  {
    id: 'lesson-08',
    slug: 'data-lineage',
    chapter: '08',
    title: '什么是数据血缘？',
    summary: '点击一张表，追踪它的上游来源和下游影响，理解变更的爆炸半径。',
    order: 10,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    tags: ['血缘', '影响分析'],
    demo: 'lineage',
  },
  {
    id: 'lesson-star-schema-grain',
    slug: 'star-schema-and-grain',
    chapter: '03',
    title: '星型模型与粒度',
    summary: '从订单大宽表拆出事实和维度，亲手切换粒度，并看见粒度错误如何让金额重复计算。',
    order: 4,
    difficulty: 'beginner',
    estimatedMinutes: 14,
    tags: ['星型模型', '事实表', '粒度'],
    demo: 'star-schema',
  },
  {
    id: 'lesson-scd-type-2',
    slug: 'slowly-changing-dimension',
    chapter: '03',
    title: '维度为什么要保存历史？SCD Type 2',
    summary:
      '通过一次会员升级，观察直接 UPDATE 如何覆盖历史，并用有效时间区间保留“当时”的维度状态。',
    order: 5,
    difficulty: 'beginner',
    estimatedMinutes: 12,
    tags: ['维度历史', 'SCD Type 2', '时间区间'],
    demo: 'scd',
  },
  {
    id: 'lesson-09',
    slug: 'data-governance',
    chapter: '09',
    title: '数据治理：让数据可以被找到和使用',
    summary: '从目录、权限、标准和责任人理解治理不是额外的文档工作。',
    order: 11,
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    tags: ['治理', '元数据'],
    demo: 'coming-soon',
  },
  {
    id: 'lesson-10',
    slug: 'lakehouse',
    chapter: '10',
    title: '湖仓：为什么数据湖最终需要仓库能力',
    summary: '用同一份订单、事件和文件数据切换三种架构，观察 schema、事务、版本和治理能力的取舍。',
    order: 12,
    difficulty: 'advanced',
    estimatedMinutes: 18,
    tags: ['湖仓', '架构切换', '版本'],
    demo: 'lakehouse',
  },
  {
    id: 'lesson-11',
    slug: 'performance-and-practice',
    chapter: '11',
    title: '性能与工程实践',
    summary: '从分区、数据倾斜和复用角度，认识性能优化背后的工程权衡。',
    order: 13,
    difficulty: 'advanced',
    estimatedMinutes: 15,
    tags: ['性能', '工程'],
    demo: 'coming-soon',
  },
  {
    id: 'lesson-12',
    slug: 'build-a-warehouse',
    chapter: '12',
    title: '从 0 搭一套数据仓库',
    summary: '把前面的概念串成一条路线，从业务问题走到可维护的数据产品。',
    order: 14,
    difficulty: 'advanced',
    estimatedMinutes: 20,
    tags: ['实践', '项目'],
    demo: 'coming-soon',
  },
]

export const lessons = [...lessonDrafts].sort((left, right) => left.order - right.order)

export const chapters: Chapter[] = chapterDefinitions.map(([id, title]) => ({
  id,
  title,
  lessons: lessons.filter((lesson) => lesson.chapter === id),
}))

export function getLessonBySlug(slug: string): Lesson | undefined {
  return lessons.find((lesson) => lesson.slug === slug)
}

export function getChapterTitle(chapterId: string): string {
  return chapterDefinitions.find(([id]) => id === chapterId)?.[1] ?? '课程内容'
}
