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

export function BusinessSystemFlow({ systems, warehouseLabel, outputs }: BusinessSystemFlowProps) {
  const [phase, setPhase] = useState<FlowPhase>(0)
  const [selectedSystemId, setSelectedSystemId] = useState(systems[0]?.id ?? '')
  const timerIds = useRef<number[]>([])
  const selectedSystem = systems.find((system) => system.id === selectedSystemId) ?? systems[0]

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
    <div className={`business-flow business-flow--phase-${phase}`}>
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">数据搬运实验</span>
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

      <div className="business-flow__diagram">
        <div className="business-flow__sources">
          <div className="business-flow__column-label">多个业务系统</div>
          <div className="business-flow__source-grid">
            {systems.map((system, index) => {
              const isSelected = system.id === selectedSystemId
              return (
                <button
                  className={`system-node${isSelected ? ' is-selected' : ''}`}
                  type="button"
                  key={system.id}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedSystemId(system.id)}
                >
                  <span className="system-node__icon" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <strong>{system.name}</strong>
                    <small>{system.volume}</small>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="business-flow__connector" aria-hidden="true">
          <span className="business-flow__connector-line" />
          <span className="business-flow__connector-label">采集 / 同步</span>
          <span className="business-flow__connector-arrow">→</span>
        </div>

        <div className="warehouse-node">
          <span className="warehouse-node__eyebrow">分析数据空间</span>
          <strong>{warehouseLabel}</strong>
          <span>统一口径 · 保留历史</span>
          {phase >= 2 && <span className="warehouse-node__status">正在承接分析负载</span>}
        </div>

        <div
          className="business-flow__connector business-flow__connector--output"
          aria-hidden="true"
        >
          <span className="business-flow__connector-line" />
          <span className="business-flow__connector-label">组织 / 服务</span>
          <span className="business-flow__connector-arrow">→</span>
        </div>

        <div className="business-flow__outputs">
          <div className="business-flow__column-label">分析使用</div>
          {outputs.map((output) => (
            <div className="output-node" key={output.name}>
              <strong>{output.name}</strong>
              <span>{output.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="business-flow__packet" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      {selectedSystem && (
        <div className="flow-inspector" aria-live="polite">
          <span className="flow-inspector__tag">当前查看</span>
          <div>
            <strong>{selectedSystem.name}</strong>
            <p>{selectedSystem.detail}。它负责把交易事实记录好，而不是承担所有跨主题分析。</p>
          </div>
        </div>
      )}
    </div>
  )
}
