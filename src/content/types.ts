import type {
  BankingCustomerHistoryVisualization,
  BankingFactTypesVisualization,
  BankingStarSchemaVisualization,
  FlowOutput,
  GovernanceVisualization,
  LakehouseVisualization,
  LineageEdge,
  LineageNode,
  MetricVisualization,
  BankingMetricDefinitionVisualization,
  BankingMetricDerivationVisualization,
  BankingMetricScopeVisualization,
  BankingMetricTimeVisualization,
  LayerEvolutionVisualization,
  LoanBusinessProcessVisualization,
  LoanGrainVisualization,
  ReportMetricJourneyVisualization,
  SourceSystem,
  StarSchemaVisualization,
  WarehouseTermsVisualization,
} from '../types'
import type { LineageTeachingConfig } from '../features/lineage/types'
import type { SchedulerVisualization } from '../features/scheduler/types'
import type { SqlTransformationVisualization } from '../features/sql-transformation/types'
import type { PerformanceVisualization } from '../features/performance/types'
import type { DataQualityVisualization } from '../features/data-quality/types'
import type { DataServiceVisualization } from '../features/data-service/types'
import type { CapstoneVisualization } from '../features/capstone/types'
import type { JoinFanoutVisualization } from '../features/join-fanout/types'
import type { LifecyclePathVisualization } from '../features/lifecycle-path/types'

export interface LessonOpening {
  eyebrow: string
  title: string
  intro: string
  cards: Array<{
    label: string
    value: string
    detail: string
  }>
  question: string
}

export interface LessonNarrativeSection {
  /** Legacy sections may omit kind; omitted kind is treated as narrative. */
  kind?: 'narrative'
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export interface LessonComparison {
  title: string
  intro?: string
  columns: Array<{
    label: string
    title: string
    points: string[]
  }>
}

export interface LessonCompareSection extends LessonComparison {
  kind: 'compare'
}

export interface LessonCodeExample {
  label: string
  language: string
  code: string
}

export interface LessonSqlSection extends LessonCodeExample {
  kind: 'sql'
}

export interface LessonVisualizationSection {
  kind: 'visualization'
  eyebrow: string
  title: string
  description: string
  visualization: LessonVisualization
}

export interface LessonTakeawaySection {
  kind: 'takeaway'
  title: string
  text: string
  bullets?: string[]
}

export interface LessonEngineeringNoteSection {
  kind: 'engineering-note'
  title?: string
  text: string
}

export interface LessonPitfallSection {
  kind: 'pitfall'
  title?: string
  text: string
}

/**
 * A lesson can compose different teaching intentions in any order.
 * The optional kind on LessonNarrativeSection keeps existing lesson data valid.
 */
export type LessonSection =
  | LessonNarrativeSection
  | LessonCompareSection
  | LessonSqlSection
  | LessonVisualizationSection
  | LessonTakeawaySection
  | LessonEngineeringNoteSection
  | LessonPitfallSection

export type LessonVisualization =
  | {
      kind: 'systems'
      systems: SourceSystem[]
      warehouseLabel: string
      outputs: FlowOutput[]
    }
  | LayerEvolutionVisualization
  | ReportMetricJourneyVisualization
  | WarehouseTermsVisualization
  | {
      kind: 'lineage'
      nodes: LineageNode[]
      edges: LineageEdge[]
      /** Lessons render the teaching wrapper instead of the legacy graph. */
      teaching: LineageTeachingConfig
    }
  | LoanBusinessProcessVisualization
  | LoanGrainVisualization
  | BankingStarSchemaVisualization
  | BankingFactTypesVisualization
  | BankingCustomerHistoryVisualization
  | StarSchemaVisualization
  | MetricVisualization
  | BankingMetricScopeVisualization
  | BankingMetricDefinitionVisualization
  | BankingMetricTimeVisualization
  | BankingMetricDerivationVisualization
  | LakehouseVisualization
  | SqlTransformationVisualization
  | JoinFanoutVisualization
  | LifecyclePathVisualization
  | GovernanceVisualization
  | PerformanceVisualization
  | SchedulerVisualization
  | DataQualityVisualization
  | DataServiceVisualization
  | CapstoneVisualization

export interface LessonContent {
  eyebrow: string
  opening?: LessonOpening
  subtitle: string
  quickSummary: string
  concept: {
    term: string
    definition: string
  }
  sections: LessonSection[]
  /** @deprecated Put visualizations in a typed section when migrating a lesson. */
  visualization?: LessonVisualization
  /** @deprecated Put comparisons in a `kind: 'compare'` section when migrating a lesson. */
  comparison?: LessonComparison
  /** @deprecated Put SQL examples in a `kind: 'sql'` section when migrating a lesson. */
  code?: LessonCodeExample
  /** @deprecated Put this in a `kind: 'engineering-note'` section when migrating a lesson. */
  engineeringTip?: string
  /** @deprecated Put this in a `kind: 'pitfall'` section when migrating a lesson. */
  pitfalls?: string[]
}
