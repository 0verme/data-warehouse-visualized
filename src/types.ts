export interface SourceSystem {
  id: string
  name: string
  detail: string
  volume: string
}

export interface FlowOutput {
  name: string
  detail: string
}

export interface PipelineStage {
  id: string
  layer: string
  title: string
  description: string
  work: string
  output: string
}

export interface LineageNode {
  id: string
  label: string
  layer: string
  role: string
  x: number
  y: number
}

export interface LineageEdge {
  source: string
  target: string
}
