import type { LessonContent } from '../types'

/**
 * 客户端按需加载器：slug -> () => Promise<LessonContent>。
 *
 * 与服务端静态 registry（`src/content/lessons/index.ts`）保持 1:1 对应：
 * - 服务端 `getLessonContent(lesson)` 供 Astro getStaticPaths / build-code-highlight 在构建期同步使用；
 * - 客户端只允许通过本模块按 slug 动态 import，Vite 会为每个内容模块生成独立 chunk，
 *   普通课程的 initial JS 不再携带非当前课程的正文与 feature data。
 *
 * `tests/client-loader.test.ts` 负责校验两个 map 的 slug 完全一致，
 * 新增课程时必须同时更新 index.ts 与本模块。
 */
const lessonContentLoaders: Record<string, () => Promise<LessonContent>> = {
  'build-a-warehouse': () => import('./capstone').then((m) => m.capstoneContent),
  'data-governance': () => import('./data-governance').then((m) => m.dataGovernanceContent),
  'data-governance-evidence': () =>
    import('./data-governance').then((m) => m.governanceEvidenceContent),
  'data-governance-field-access': () =>
    import('./data-governance').then((m) => m.governanceFieldAccessContent),
  'data-governance-lifecycle': () =>
    import('./data-governance').then((m) => m.governanceLifecycleContent),
  'data-governance-change-responsibility': () =>
    import('./data-governance').then((m) => m.governanceChangeResponsibilityContent),
  'data-quality': () => import('./data-quality').then((m) => m.dataQualityContent),
  'data-quality-rules': () => import('./data-quality-rules').then((m) => m.dataQualityRulesContent),
  'data-quality-dataset': () =>
    import('./data-quality-dataset').then((m) => m.dataQualityDatasetContent),
  'data-quality-evidence': () =>
    import('./data-quality-evidence').then((m) => m.dataQualityEvidenceContent),
  'data-quality-release': () =>
    import('./data-quality-release').then((m) => m.dataQualityReleaseContent),
  'data-service': () => import('./data-service').then((m) => m.dataServiceContent),
  'data-service-report': () => import('./data-service').then((m) => m.dataServiceReportContent),
  'data-service-file': () => import('./data-service').then((m) => m.dataServiceFileContent),
  'data-service-api': () => import('./data-service').then((m) => m.dataServiceApiContent),
  'data-service-choice': () => import('./data-service').then((m) => m.dataServiceDecisionContent),
  'why-data-warehouse': () => import('./why-data-warehouse').then((m) => m.whyDataWarehouseContent),
  'warehouse-layers': () => import('./warehouse-layers').then((m) => m.warehouseLayersContent),
  'report-metric-journey': () =>
    import('./report-metric-journey').then((m) => m.reportMetricJourneyContent),
  'warehouse-terms': () => import('./warehouse-terms').then((m) => m.warehouseTermsContent),
  'data-lineage': () => import('./data-lineage').then((m) => m.dataLineageContent),
  'data-lineage-fields': () =>
    import('./data-lineage-fields').then((m) => m.dataLineageFieldsContent),
  'data-lineage-investigation': () =>
    import('./data-lineage-investigation').then((m) => m.dataLineageInvestigationContent),
  'data-lineage-impact': () =>
    import('./data-lineage-impact').then((m) => m.dataLineageImpactContent),
  'data-lineage-evidence': () =>
    import('./data-lineage-evidence').then((m) => m.dataLineageEvidenceContent),
  'data-modeling': () => import('./data-modeling').then((m) => m.dataModelingContent),
  'fact-table-types': () => import('./fact-table-types').then((m) => m.factTableTypesContent),
  grain: () => import('./grain').then((m) => m.grainContent),
  'metric-system': () => import('./metric-system').then((m) => m.metricSystemContent),
  'deposit-metric-definition': () =>
    import('./deposit-metric-definition').then((m) => m.depositMetricDefinitionContent),
  'deposit-metric-time': () =>
    import('./deposit-metric-time').then((m) => m.depositMetricTimeContent),
  'deposit-metric-derivations': () =>
    import('./deposit-metric-derivations').then((m) => m.depositMetricDerivationsContent),
  'star-schema-and-grain': () =>
    import('./star-schema-and-grain').then((m) => m.starSchemaAndGrainContent),
  'slowly-changing-dimension': () =>
    import('./slowly-changing-dimension').then((m) => m.slowlyChangingDimensionContent),
  lakehouse: () => import('./lakehouse').then((m) => m.lakehouseContent),
  'lakehouse-replication': () => import('./lakehouse').then((m) => m.lakehouseReplicationContent),
  'lakehouse-table-layer': () => import('./lakehouse').then((m) => m.lakehouseTableLayerContent),
  'lakehouse-unity': () => import('./lakehouse').then((m) => m.lakehouseUnityContent),
  'scheduling-system': () =>
    import('./scheduling-business-date').then((m) => m.schedulingBusinessDateContent),
  'scheduling-readiness': () =>
    import('./scheduling-readiness').then((m) => m.schedulingReadinessContent),
  'scheduling-failure': () =>
    import('./scheduling-failure').then((m) => m.schedulingFailureContent),
  'scheduling-rerun': () => import('./scheduling-rerun').then((m) => m.schedulingRerunContent),
  'scheduling-sla': () => import('./scheduling-sla').then((m) => m.schedulingSlaContent),
  'sql-and-transformation': () =>
    import('./sql-and-transformation').then((m) => m.sqlAndTransformationContent),
  'sql-transformation-cleaning': () =>
    import('./sql-and-transformation-cleaning').then((m) => m.sqlTransformationCleaningContent),
  'sql-transformation-join': () =>
    import('./sql-and-transformation-join').then((m) => m.sqlTransformationJoinContent),
  'sql-transformation-layers': () =>
    import('./sql-and-transformation-layers').then((m) => m.sqlTransformationLayersContent),
  'sql-transformation-contract': () =>
    import('./sql-and-transformation-contract').then((m) => m.sqlTransformationContractContent),
  'performance-and-practice': () =>
    import('./performance-and-practice').then((m) => m.performanceAndPracticeContent),
  'performance-scan-layout': () =>
    import('./performance-scan-layout').then((m) => m.performanceScanLayoutContent),
  'performance-shuffle-skew': () =>
    import('./performance-shuffle-skew').then((m) => m.performanceShuffleSkewContent),
  'performance-first-seen': () =>
    import('./performance-first-seen').then((m) => m.performanceFirstSeenContent),
  'performance-tradeoffs': () =>
    import('./performance-tradeoffs').then((m) => m.performanceTradeoffsContent),
  'lifecycle-path-failure': () =>
    import('./lifecycle-path-failure').then((m) => m.lifecyclePathFailureContent),
}

const lessonContentCache = new Map<string, LessonContent>()
const lessonContentInflight = new Map<string, Promise<LessonContent>>()

/** 以 SSR 提供的 content 预置缓存（首屏课程无需网络请求）。 */
export function primeLessonContentCache(slug: string, content: LessonContent): void {
  lessonContentCache.set(slug, content)
}

/** 已加载的课程内容；未加载时返回 undefined（调用方可用它避免进入 loading 态）。 */
export function peekLessonContent(slug: string): LessonContent | undefined {
  return lessonContentCache.get(slug)
}

/**
 * 按 slug 加载课程内容。
 *
 * - 已缓存：直接返回；
 * - 加载中：复用同一个 in-flight Promise，避免连续切换/回退重复请求；
 * - 失败：清理 in-flight，允许调用方重试。
 */
export function loadLessonContent(slug: string): Promise<LessonContent> {
  const cached = lessonContentCache.get(slug)
  if (cached) {
    return Promise.resolve(cached)
  }

  const inflight = lessonContentInflight.get(slug)
  if (inflight) {
    return inflight
  }

  const loader = lessonContentLoaders[slug]
  if (!loader) {
    return Promise.reject(new Error(`No lesson content loader registered for slug: ${slug}`))
  }

  const pending = loader().then(
    (content) => {
      lessonContentCache.set(slug, content)
      lessonContentInflight.delete(slug)
      return content
    },
    (error: unknown) => {
      lessonContentInflight.delete(slug)
      throw error
    },
  )
  lessonContentInflight.set(slug, pending)
  return pending
}
