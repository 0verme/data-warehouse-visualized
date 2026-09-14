import type {
  FlowOutput,
  LineageEdge,
  LineageNode,
  MetricVisualization,
  ModelingIntroVisualization,
  PipelineStage,
  ScdVisualization,
  SourceSystem,
  StarSchemaVisualization,
} from '../types'

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

export interface LessonSection {
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

export interface LessonCodeExample {
  label: string
  language: string
  code: string
}

export type LessonVisualization =
  | {
      kind: 'systems'
      systems: SourceSystem[]
      warehouseLabel: string
      outputs: FlowOutput[]
    }
  | {
      kind: 'pipeline'
      stages: PipelineStage[]
    }
  | {
      kind: 'lineage'
      nodes: LineageNode[]
      edges: LineageEdge[]
    }
  | ModelingIntroVisualization
  | StarSchemaVisualization
  | ScdVisualization
  | MetricVisualization

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
  visualization?: LessonVisualization
  comparison?: LessonComparison
  code?: LessonCodeExample
  engineeringTip: string
  pitfalls: string[]
}
