import type { LineageEdge, LineageNode } from '../types'

function buildReverseAdjacency(edges: readonly LineageEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()

  for (const edge of edges) {
    const upstream = adjacency.get(edge.target) ?? []
    upstream.push(edge.source)
    adjacency.set(edge.target, upstream)
  }

  return adjacency
}

function buildAdjacency(edges: readonly LineageEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()

  for (const edge of edges) {
    const downstream = adjacency.get(edge.source) ?? []
    downstream.push(edge.target)
    adjacency.set(edge.source, downstream)
  }

  return adjacency
}

function walkGraph(startId: string, adjacency: Map<string, string[]>): string[] {
  const visited = new Set<string>()
  const queue = [...(adjacency.get(startId) ?? [])]
  const result: string[] = []

  while (queue.length > 0) {
    const currentId = queue.shift()

    if (!currentId || visited.has(currentId)) {
      continue
    }

    visited.add(currentId)
    result.push(currentId)
    queue.push(...(adjacency.get(currentId) ?? []))
  }

  return result
}

export function getUpstreamNodes(
  _nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
): string[] {
  return walkGraph(nodeId, buildReverseAdjacency(edges))
}

export function getDownstreamNodes(
  _nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
): string[] {
  return walkGraph(nodeId, buildAdjacency(edges))
}

export function getDirectDownstreamNodes(edges: readonly LineageEdge[], nodeId: string): string[] {
  return [...new Set(edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target))]
}

export interface ImpactAnalysis {
  upstream: string[]
  directDownstream: string[]
  finalImpact: string[]
}

export function getImpactAnalysis(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
): ImpactAnalysis {
  return {
    upstream: getUpstreamNodes(nodes, edges, nodeId),
    directDownstream: getDirectDownstreamNodes(edges, nodeId),
    finalImpact: getDownstreamNodes(nodes, edges, nodeId),
  }
}
