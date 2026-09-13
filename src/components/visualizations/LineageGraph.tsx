import { useEffect, useMemo, useRef, useState } from 'react'
import type { LineageEdge, LineageNode } from '../../types'
import { getImpactAnalysis, getDownstreamNodes } from '../../utils/lineage'

interface LineageGraphProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
}

function getNode(nodes: readonly LineageNode[], nodeId: string): LineageNode | undefined {
  return nodes.find((node) => node.id === nodeId)
}

export function LineageGraph({ nodes, edges }: LineageGraphProps) {
  const defaultNodeId = nodes.find((node) => node.layer === 'DWD')?.id ?? nodes[0]?.id ?? ''
  const [selectedNodeId, setSelectedNodeId] = useState(defaultNodeId)
  const [impactStep, setImpactStep] = useState(0)
  const timerIds = useRef<number[]>([])
  const selectedNode = getNode(nodes, selectedNodeId)
  const analysis = useMemo(
    () => getImpactAnalysis(nodes, edges, selectedNodeId),
    [nodes, edges, selectedNodeId],
  )
  const downstreamOrder = useMemo(
    () => getDownstreamNodes(nodes, edges, selectedNodeId),
    [nodes, edges, selectedNodeId],
  )

  function clearTimers() {
    timerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    timerIds.current = []
  }

  function resetSimulation() {
    clearTimers()
    setImpactStep(0)
  }

  function selectNode(nodeId: string) {
    resetSimulation()
    setSelectedNodeId(nodeId)
  }

  function scheduleImpact(step: number) {
    const timerId = window.setTimeout(() => {
      setImpactStep(step)
      if (step < downstreamOrder.length + 1) {
        scheduleImpact(step + 1)
      }
    }, 700)
    timerIds.current.push(timerId)
  }

  function simulateDelete() {
    clearTimers()

    if (!selectedNode) {
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setImpactStep(downstreamOrder.length + 1)
      return
    }

    setImpactStep(1)
    if (downstreamOrder.length > 0) {
      scheduleImpact(2)
    }
  }

  useEffect(() => {
    return () => {
      timerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [])

  const selectedRelatedIds = new Set([
    selectedNodeId,
    ...analysis.upstream,
    ...analysis.finalImpact,
  ])
  const isSimulationFinished = impactStep >= downstreamOrder.length + 1 && impactStep > 0

  return (
    <div className="lineage-graph">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">Lineage Graph · 影响分析</span>
          <p aria-live="polite">
            {selectedNode
              ? `当前选中 ${selectedNode.label}：点击节点，查看它的上下游关系`
              : '点击节点，查看它的上下游关系'}
          </p>
        </div>
        <div className="visualization-toolbar__actions">
          <button
            className="button button--primary button--small"
            type="button"
            onClick={simulateDelete}
          >
            {isSimulationFinished ? '重新模拟删除' : '模拟删除'}
          </button>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={resetSimulation}
          >
            重置
          </button>
        </div>
      </div>

      <div className="lineage-canvas" aria-label="数据血缘关系图">
        <svg
          className="lineage-canvas__svg"
          viewBox="0 0 760 450"
          preserveAspectRatio="none"
          role="img"
          aria-labelledby="lineage-title"
        >
          <title id="lineage-title">数据表之间的上游和下游依赖关系</title>
          <defs>
            <marker
              id="lineage-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const source = getNode(nodes, edge.source)
            const target = getNode(nodes, edge.target)
            if (!source || !target) {
              return null
            }

            const edgeIsActive =
              selectedRelatedIds.has(edge.source) && selectedRelatedIds.has(edge.target)
            return (
              <line
                className={`lineage-edge${edgeIsActive ? ' is-active' : ''}`}
                key={`${edge.source}-${edge.target}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                markerEnd="url(#lineage-arrow)"
              />
            )
          })}
        </svg>

        <div className="lineage-canvas__nodes">
          {nodes.map((node) => {
            const isSelected = node.id === selectedNodeId
            const isRelated = selectedRelatedIds.has(node.id)
            const downstreamIndex = downstreamOrder.indexOf(node.id)
            const isDeleted = isSelected && impactStep >= 1
            const isAffected = downstreamIndex >= 0 && impactStep >= downstreamIndex + 2
            const nodeState = isDeleted ? '已删除' : isAffected ? '受影响' : node.role

            return (
              <button
                className={`lineage-node lineage-node--${node.layer.toLowerCase()}${
                  isSelected ? ' is-selected' : ''
                }${isRelated ? ' is-related' : ''}${isDeleted ? ' is-deleted' : ''}${
                  isAffected ? ' is-affected' : ''
                }`}
                key={node.id}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${node.label}，${node.layer}，${nodeState}`}
                style={{ left: `${(node.x / 760) * 100}%`, top: `${(node.y / 450) * 100}%` }}
                onClick={() => selectNode(node.id)}
              >
                <span className="lineage-node__layer">{node.layer}</span>
                <strong>{node.label}</strong>
                <small>{nodeState}</small>
              </button>
            )
          })}
        </div>
      </div>

      <div className="lineage-selection" aria-live="polite">
        <div>
          <span className="eyebrow eyebrow--small">当前节点</span>
          <strong>{selectedNode?.label ?? '未选择节点'}</strong>
        </div>
        <p>{selectedNode?.role ?? '请选择一张表'}</p>
      </div>

      <div className="impact-stats" aria-label="影响分析统计">
        <div>
          <strong>{analysis.upstream.length}</strong>
          <span>上游</span>
        </div>
        <div>
          <strong>{analysis.directDownstream.length}</strong>
          <span>直接下游</span>
        </div>
        <div>
          <strong>{analysis.finalImpact.length}</strong>
          <span>最终影响</span>
        </div>
      </div>

      <ol className="impact-timeline" aria-label="删除影响传播过程">
        <li className={impactStep >= 1 ? 'is-visible' : ''}>
          <span>1</span>
          <div>
            <strong>{selectedNode?.label ?? '当前节点'}</strong>
            <small>{impactStep >= 1 ? '已删除' : '等待模拟'}</small>
          </div>
        </li>
        {downstreamOrder.map((nodeId, index) => {
          const node = getNode(nodes, nodeId)
          const isVisible = impactStep >= index + 2
          return (
            <li className={isVisible ? 'is-visible' : ''} key={nodeId}>
              <span>{index + 2}</span>
              <div>
                <strong>{node?.label ?? nodeId}</strong>
                <small>{isVisible ? '受影响' : '等待传播'}</small>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        这是教学模拟：真实项目中的血缘通常来自任务配置、SQL 解析和元数据采集。
      </p>
    </div>
  )
}
