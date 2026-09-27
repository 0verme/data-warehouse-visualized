import learnShellStylesUrl from '../styles/layouts/learn-shell.css?url'
import sharedLessonStylesUrl from '../styles/components/shared-lesson.css?url'
import visualizationCompactStylesUrl from '../styles/components/visualization-compact.css?url'
import warehouseIntroStylesUrl from '../styles/lessons/warehouse-intro.css?url'
import bankingModelingStylesUrl from '../styles/lessons/banking-modeling.css?url'
import bankingMetricsStylesUrl from '../styles/lessons/banking-metrics.css?url'
import starSchemaStylesUrl from '../styles/lessons/star-schema.css?url'
import metricStylesUrl from '../styles/lessons/metric.css?url'
import sqlWorkbenchStylesUrl from '../styles/lessons/sql-workbench.css?url'
import joinFanoutStylesUrl from '../styles/lessons/join-fanout.css?url'
import lifecyclePathStylesUrl from '../styles/lessons/lifecycle-path.css?url'
import schedulerStylesUrl from '../styles/lessons/scheduler.css?url'
import sensorReadinessStylesUrl from '../styles/lessons/sensor-readiness.css?url'
import dataQualityStylesUrl from '../styles/lessons/data-quality.css?url'
import lineageStylesUrl from '../styles/lessons/lineage.css?url'
import lineageTeachingStylesUrl from '../styles/lessons/lineage-teaching.css?url'
import governanceStylesUrl from '../styles/lessons/governance.css?url'
import lakehouseStylesUrl from '../styles/lessons/lakehouse.css?url'
import dataServiceStylesUrl from '../styles/lessons/data-service.css?url'
import performanceStylesUrl from '../styles/lessons/performance.css?url'
import capstoneStylesUrl from '../styles/lessons/capstone.css?url'
import type { LessonContent, LessonVisualization } from '../content/types'

export type LessonVisualizationKind = LessonVisualization['kind']

/**
 * Lesson stylesheet registry. Each entry maps a stable stylesheet name to the
 * processed `?url` asset emitted by Vite. Keeping the names explicit lets tests
 * assert CSS ownership without depending on build-time hashes.
 */
const lessonStyleUrls = {
  'warehouse-intro.css': warehouseIntroStylesUrl,
  'banking-modeling.css': bankingModelingStylesUrl,
  'banking-metrics.css': bankingMetricsStylesUrl,
  'star-schema.css': starSchemaStylesUrl,
  'metric.css': metricStylesUrl,
  'sql-workbench.css': sqlWorkbenchStylesUrl,
  'join-fanout.css': joinFanoutStylesUrl,
  'lifecycle-path.css': lifecyclePathStylesUrl,
  'scheduler.css': schedulerStylesUrl,
  'sensor-readiness.css': sensorReadinessStylesUrl,
  'data-quality.css': dataQualityStylesUrl,
  'lineage.css': lineageStylesUrl,
  'lineage-teaching.css': lineageTeachingStylesUrl,
  'governance.css': governanceStylesUrl,
  'lakehouse.css': lakehouseStylesUrl,
  'data-service.css': dataServiceStylesUrl,
  'performance.css': performanceStylesUrl,
  'capstone.css': capstoneStylesUrl,
} as const

export type LessonStyleSheet = keyof typeof lessonStyleUrls

/**
 * Styles owned by every lesson page: the learn shell chrome, the shared lesson
 * primitives, and the compact visualization container-query layer.
 *
 * These are linked explicitly instead of being imported by React components so
 * Astro does not hoist dynamically imported visualization CSS into every page.
 */
export const learnSharedStyleUrls: readonly string[] = [
  learnShellStylesUrl,
  sharedLessonStylesUrl,
  visualizationCompactStylesUrl,
]

/**
 * Visualization CSS ownership. A lesson only links the stylesheets of the
 * visualization kinds it actually renders (plus the shared learn styles).
 */
export const visualizationStyleSheets: Record<
  LessonVisualizationKind,
  readonly LessonStyleSheet[]
> = {
  systems: [],
  'layer-evolution': ['warehouse-intro.css'],
  'report-metric-journey': ['warehouse-intro.css'],
  'warehouse-terms': ['warehouse-intro.css'],
  lineage: ['lineage-teaching.css'],
  'loan-business-process': ['banking-modeling.css'],
  'loan-grain': ['banking-modeling.css'],
  'banking-star-schema': ['banking-modeling.css'],
  'banking-fact-types': ['banking-modeling.css'],
  'banking-customer-history': ['banking-modeling.css'],
  'star-schema': ['star-schema.css'],
  'metric-definition': ['metric.css'],
  'banking-metric-scope': ['banking-metrics.css'],
  'banking-metric-definition': ['banking-metrics.css'],
  'banking-metric-time': ['banking-metrics.css'],
  'banking-metric-derivations': ['banking-metrics.css'],
  lakehouse: ['lakehouse.css'],
  'sql-transformation': ['sql-workbench.css'],
  'join-fanout': ['join-fanout.css'],
  'lifecycle-path': ['lifecycle-path.css'],
  governance: ['governance.css'],
  'performance-lab': ['performance.css'],
  scheduler: ['scheduler.css', 'sensor-readiness.css'],
  'data-quality': ['data-quality.css'],
  'data-service': ['data-service.css'],
  // Capstone renders the frozen legacy lineage graph, so it only needs the legacy lineage CSS.
  capstone: ['capstone.css', 'lineage.css'],
}

export function getVisualizationStyleSheets(
  kind: LessonVisualizationKind,
): readonly LessonStyleSheet[] {
  return visualizationStyleSheets[kind]
}

export function getVisualizationStyleUrls(kind: LessonVisualizationKind): readonly string[] {
  return getVisualizationStyleSheets(kind).map((name) => lessonStyleUrls[name])
}

function collectVisualizationKinds(content: LessonContent): LessonVisualizationKind[] {
  const kinds = new Set<LessonVisualizationKind>()

  for (const section of content.sections) {
    if (section.kind === 'visualization') {
      kinds.add(section.visualization.kind)
    }
  }

  if (content.visualization) {
    kinds.add(content.visualization.kind)
  }

  return [...kinds]
}

export function getLessonStyleSheets(content: LessonContent): LessonStyleSheet[] {
  const sheets = new Set<LessonStyleSheet>()

  for (const kind of collectVisualizationKinds(content)) {
    for (const sheet of getVisualizationStyleSheets(kind)) {
      sheets.add(sheet)
    }
  }

  return [...sheets]
}

/**
 * Lesson-specific stylesheets for a lesson content payload. Returns URLs in a
 * stable order and de-duplicates shared dependencies (e.g. lineage used by
 * both the lineage lessons and capstone).
 */
export function getLessonStyleUrls(content: LessonContent): string[] {
  return getLessonStyleSheets(content).map((name) => lessonStyleUrls[name])
}

/**
 * Client-side fallback for lessons that are not the page's SSR lesson (for
 * example `/learn/` restoring the stored progress lesson). The page already
 * links the SSR lesson styles; this only appends missing stylesheets and never
 * re-adds a URL that is already present in the document head.
 */
export function ensureLessonStyles(content: LessonContent): void {
  if (typeof document === 'undefined') {
    return
  }

  for (const href of getLessonStyleUrls(content)) {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
      continue
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.lessonStyle = 'true'
    document.head.append(link)
  }
}
