import type { FlowOutput, LineageEdge, LineageNode, PipelineStage, SourceSystem } from '../types'

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

export interface LessonContent {
  eyebrow: string
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
