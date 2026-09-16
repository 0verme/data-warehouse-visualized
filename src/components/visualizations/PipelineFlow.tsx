import { useEffect, useRef, useState } from 'react'
import type { PipelineStage } from '../../types'

interface PipelineFlowProps {
  stages: PipelineStage[]
}

type StageStatus = 'waiting' | 'processing' | 'done'

export function PipelineFlow({ stages }: PipelineFlowProps) {
  const [activeStage, setActiveStage] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const timerIds = useRef<number[]>([])

  function clearTimers() {
    timerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    timerIds.current = []
  }

  function playNext(stageIndex: number) {
    const timerId = window.setTimeout(() => {
      setActiveStage(stageIndex)

      if (stageIndex >= stages.length - 1) {
        setIsPlaying(false)
        return
      }

      playNext(stageIndex + 1)
    }, 1050)
    timerIds.current.push(timerId)
  }

  function startFlow() {
    clearTimers()

    if (stages.length === 0) {
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setActiveStage(stages.length - 1)
      setIsPlaying(false)
      return
    }

    setActiveStage(0)
    if (stages.length === 1) {
      setIsPlaying(false)
      return
    }

    setIsPlaying(true)
    playNext(1)
  }

  function resetFlow() {
    clearTimers()
    setActiveStage(-1)
    setIsPlaying(false)
  }

  useEffect(() => {
    return () => {
      timerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [])

  function getStageStatus(index: number): StageStatus {
    if (activeStage < 0 || index > activeStage) {
      return 'waiting'
    }

    if (index < activeStage || (!isPlaying && activeStage === stages.length - 1)) {
      return 'done'
    }

    return 'processing'
  }

  const currentStage = activeStage >= 0 ? stages[activeStage] : undefined
  const hasFinished = activeStage === stages.length - 1 && !isPlaying

  return (
    <div className="pipeline-flow">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">数据职责加工实验</span>
          <p aria-live="polite">
            {currentStage
              ? `${currentStage.layer}：${currentStage.work} → ${currentStage.output}`
              : '点击开始，让一批业务数据依次经过不同职责的处理环节'}
          </p>
        </div>
        <div className="visualization-toolbar__actions">
          <button
            className="button button--primary button--small"
            type="button"
            onClick={startFlow}
          >
            {hasFinished ? '重新播放' : isPlaying ? '加工中…' : '开始加工'}
          </button>
          <button className="button button--quiet button--small" type="button" onClick={resetFlow}>
            重置
          </button>
        </div>
      </div>

      <div className="pipeline-flow__track" aria-label="从业务系统到下游使用的数据加工过程">
        {stages.map((stage, index) => {
          const status = getStageStatus(index)
          return (
            <div className="pipeline-flow__item" key={stage.id}>
              <article className={`pipeline-stage pipeline-stage--${status}`}>
                <div className="pipeline-stage__topline">
                  <span className="pipeline-stage__layer">{stage.layer}</span>
                  <span className="pipeline-stage__status">
                    {status === 'done' ? '已完成' : status === 'processing' ? '加工中' : '等待'}
                  </span>
                </div>
                <h3>{stage.title}</h3>
                <p>{stage.description}</p>
                <div className="pipeline-stage__output">
                  <span>产出</span>
                  <code>{stage.output}</code>
                </div>
              </article>
              {index < stages.length - 1 && (
                <div
                  className={`pipeline-flow__arrow pipeline-flow__arrow--${status}`}
                  aria-hidden="true"
                >
                  <span />
                  <strong>↓</strong>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="pipeline-flow__legend">
        <span>
          <i className="legend-dot legend-dot--done" aria-hidden="true" /> 已完成
        </span>
        <span>
          <i className="legend-dot legend-dot--processing" aria-hidden="true" /> 当前加工
        </span>
        <span>
          <i className="legend-dot legend-dot--waiting" aria-hidden="true" /> 尚未开始
        </span>
      </div>
    </div>
  )
}
