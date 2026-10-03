import { learningPaths } from './paths'

export interface LearningPathPresentation {
  /** Short selector label. */
  title: string
  /** One-sentence audience label without a leading verb. */
  audience: string
  /** One-sentence editorial description used by the Roadmap status line. */
  description: string
}

/** UI copy only; Path identities and topic references stay in `paths.ts`. */
export const learningPathPresentations: Readonly<Record<string, LearningPathPresentation>> = {
  systematic: {
    title: '系统入门',
    audience: '第一次系统学习数据仓库的人',
    description:
      '从数据仓库的问题与术语进入，沿 8 个 Stage 的主线完成核心 Topic；综合实践与生产案例可在主线之后选学。',
  },
  'sql-etl': {
    title: '已有 SQL / ETL',
    audience: '已经有 SQL / ETL 基础的人',
    description:
      '直接从建模、指标与加工契约进入，补齐质量、血缘、治理与性能判断；湖仓与数据服务可按需进入。',
  },
  production: {
    title: '生产经验',
    audience: '已有数据仓库生产经验、希望按问题域进入的人',
    description:
      '从质量、调度恢复或性能诊断等问题口进入，再连接到血缘、治理、架构、服务与生产案例。',
  },
}

export function getLearningPathPresentation(pathId: string): LearningPathPresentation {
  const presentation = learningPathPresentations[pathId]
  if (!presentation) {
    throw new Error(`Missing Roadmap Path presentation for "${pathId}"`)
  }
  return presentation
}

/** Fails loud when a declared Path has no presentation copy or vice versa. */
export function assertLearningPathPresentationCoverage(): void {
  const pathIds = new Set(learningPaths.map(({ id }) => id))
  for (const pathId of pathIds) getLearningPathPresentation(pathId)
  for (const pathId of Object.keys(learningPathPresentations)) {
    if (!pathIds.has(pathId)) {
      throw new Error(`Roadmap Path presentation "${pathId}" has no Path definition`)
    }
  }
}
