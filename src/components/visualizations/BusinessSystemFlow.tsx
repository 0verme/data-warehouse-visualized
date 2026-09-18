import { useEffect, useRef, useState } from 'react'
import type { FlowOutput, SourceSystem } from '../../types'

interface BusinessSystemFlowProps {
  systems: SourceSystem[]
  warehouseLabel: string
  outputs: FlowOutput[]
}

type FlowPhase = 0 | 1 | 2 | 3

const phaseLabels: Record<FlowPhase, string> = {
  0: '数据还在各个业务系统中',
  1: '正在汇集多来源数据',
  2: '数据仓库正在组织与加工',
  3: '数据已经可以服务分析',
}

type FlowNodeState = 'waiting' | 'collecting' | 'processing' | 'ready'
type ConnectorRelation = 'data-transform' | 'delivery-publish-consume'
type ConnectorState = 'inactive' | 'current' | 'completed'

const sourceStateLabels: Record<FlowNodeState, string> = {
  waiting: '等待汇集',
  collecting: '正在汇集',
  processing: '正在处理',
  ready: '已汇集',
}

const warehouseStateLabels: Record<FlowNodeState, string> = {
  waiting: '等待数据',
  collecting: '等待数据',
  processing: '正在组织与加工',
  ready: '可服务分析',
}

const outputStateLabels: Record<FlowNodeState, string> = {
  waiting: '等待发布',
  collecting: '等待发布',
  processing: '等待发布',
  ready: '可使用',
}

const connectorStateLabels: Record<ConnectorState, string> = {
  inactive: '尚未开始',
  current: '当前传播',
  completed: '已完成 / 可用',
}

export function getPhaseState(phase: FlowPhase): FlowNodeState {
  if (phase === 0) {
    return 'waiting'
  }

  if (phase === 1) {
    return 'collecting'
  }

  if (phase === 2) {
    return 'processing'
  }

  return 'ready'
}

export function getSourceState(phase: FlowPhase): FlowNodeState {
  if (phase === 0) {
    return 'waiting'
  }

  if (phase === 1) {
    return 'collecting'
  }

  return 'ready'
}

export function getWarehouseState(phase: FlowPhase): FlowNodeState {
  if (phase < 2) {
    return 'waiting'
  }

  return phase === 2 ? 'processing' : 'ready'
}

export function getOutputState(phase: FlowPhase): FlowNodeState {
  return phase === 3 ? 'ready' : 'waiting'
}

export function getConnectorState(relation: ConnectorRelation, phase: FlowPhase): ConnectorState {
  if (relation === 'data-transform') {
    if (phase === 0) {
      return 'inactive'
    }

    return phase === 1 ? 'current' : 'completed'
  }

  if (phase < 2) {
    return 'inactive'
  }

  return phase === 2 ? 'current' : 'completed'
}

export function BusinessSystemFlow({ systems, warehouseLabel, outputs }: BusinessSystemFlowProps) {
  const [phase, setPhase] = useState<FlowPhase>(0)
  const [selectedSystemId, setSelectedSystemId] = useState(systems[0]?.id ?? '')
  const timerIds = useRef<number[]>([])
  const selectedSystem = systems.find((system) => system.id === selectedSystemId) ?? systems[0]
  const phaseState = getPhaseState(phase)
  const sourceState = getSourceState(phase)
  const warehouseState = getWarehouseState(phase)
  const outputState = getOutputState(phase)
  const dataConnectorState = getConnectorState('data-transform', phase)
  const deliveryConnectorState = getConnectorState('delivery-publish-consume', phase)

  function clearTimers() {
    timerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    timerIds.current = []
  }

  function startFlow() {
    clearTimers()

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase(3)
      return
    }

    setPhase(1)
    const collectTimer = window.setTimeout(() => {
      setPhase(2)
      const warehouseTimer = window.setTimeout(() => setPhase(3), 1000)
      timerIds.current.push(warehouseTimer)
    }, 1000)
    timerIds.current.push(collectTimer)
  }

  function resetFlow() {
    clearTimers()
    setPhase(0)
  }

  useEffect(() => {
    return () => clearTimers()
  }, [])

  return (
    <div
      className={`business-flow business-flow--phase-${phase}`}
      data-diagram-type="flow"
      data-phase={phase}
      data-state={phaseState}
    >
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">跨系统汇聚实验</span>
          <p aria-live="polite">{phaseLabels[phase]}</p>
        </div>
        <div className="visualization-toolbar__actions">
          <button
            className="button button--primary button--small"
            type="button"
            onClick={startFlow}
          >
            {phase === 3 ? '重新播放' : '启动数据流'}
          </button>
          <button className="button button--quiet button--small" type="button" onClick={resetFlow}>
            重置
          </button>
        </div>
      </div>

      <div
        className="business-flow__diagram"
        role="group"
        aria-label="Source 到 Warehouse 再到 Consumer / Output 的数据流"
      >
        <div
          className="business-flow__sources"
          data-node-group="source"
          role="group"
          aria-label="Source：并列数据源"
        >
          <div className="business-flow__column-label">并列数据源</div>
          <div className="business-flow__source-grid">
            {systems.map((system, index) => {
              const isSelected = system.id === selectedSystemId
              return (
                <button
                  className={`system-node system-node--${sourceState}${isSelected ? ' is-selected' : ''}`}
                  type="button"
                  key={system.id}
                  data-node-role="source"
                  data-state={sourceState}
                  data-focus={isSelected ? 'primary' : 'none'}
                  aria-label={`${system.name}，Source / 数据源，${sourceStateLabels[sourceState]}，${isSelected ? '当前查看' : '未选中'}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedSystemId(system.id)}
                >
                  <span className="system-node__icon" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <strong>{system.name}</strong>
                    <small>{system.volume}</small>
                    <small className="system-node__state">{sourceStateLabels[sourceState]}</small>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div
          className={`business-flow__connector business-flow__connector--data-transform business-flow__connector--${dataConnectorState}`}
          data-relation="data-transform"
          data-from="source"
          data-to="processing"
          data-state={dataConnectorState}
          role="group"
          aria-label={`Source 到 Warehouse 的数据 / 加工关系，${connectorStateLabels[dataConnectorState]}`}
        >
          <span className="business-flow__connector-line" />
          <span className="business-flow__connector-label">采集 / 同步</span>
          <span className="business-flow__connector-state">
            {connectorStateLabels[dataConnectorState]}
          </span>
          <span className="business-flow__connector-arrow" aria-hidden="true">
            →
          </span>
        </div>

        <article
          className={`warehouse-node warehouse-node--${warehouseState}`}
          data-node-role="processing"
          data-state={warehouseState}
          aria-label={`${warehouseLabel}，Processing / Warehouse 节点，${warehouseStateLabels[warehouseState]}`}
        >
          <span className="warehouse-node__eyebrow">分析数据空间</span>
          <strong>{warehouseLabel}</strong>
          <span className="warehouse-node__description">统一口径 · 保留历史</span>
          <span className={`warehouse-node__state warehouse-node__state--${warehouseState}`}>
            {warehouseStateLabels[warehouseState]}
          </span>
          {phase >= 2 && <span className="warehouse-node__status">正在承接分析负载</span>}
        </article>

        <div
          className={`business-flow__connector business-flow__connector--delivery-publish-consume business-flow__connector--${deliveryConnectorState}`}
          data-relation="delivery-publish-consume"
          data-from="processing"
          data-to="consumer"
          data-state={deliveryConnectorState}
          role="group"
          aria-label={`Warehouse 到 Consumer / Output 的交付 / 发布-消费关系，${connectorStateLabels[deliveryConnectorState]}`}
        >
          <span className="business-flow__connector-line" />
          <span className="business-flow__connector-label">组织 / 服务</span>
          <span className="business-flow__connector-state">
            {connectorStateLabels[deliveryConnectorState]}
          </span>
          <span className="business-flow__connector-arrow" aria-hidden="true">
            →
          </span>
        </div>

        <div
          className="business-flow__outputs"
          data-node-group="consumer"
          role="group"
          aria-label="Consumer / Output：分析使用"
        >
          <div className="business-flow__column-label">分析使用</div>
          {outputs.map((output) => (
            <article
              className={`output-node output-node--${outputState}`}
              key={output.name}
              data-node-role="consumer"
              data-state={outputState}
              aria-label={`${output.name}，Consumer / Output，${outputStateLabels[outputState]}：${output.detail}`}
            >
              <strong>{output.name}</strong>
              <span>{output.detail}</span>
              <span className="output-node__state">{outputStateLabels[outputState]}</span>
            </article>
          ))}
        </div>
      </div>

      <div className="business-flow__packet" data-motion-state={phaseState} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      {selectedSystem && (
        <div className="flow-inspector" data-focus="primary" aria-live="polite">
          <span className="flow-inspector__tag">当前查看</span>
          <div>
            <strong>{selectedSystem.name}</strong>
            <p>{selectedSystem.detail}。它记录自己的业务事实，跨系统分析在数据仓库中完成。</p>
          </div>
        </div>
      )}
    </div>
  )
}
