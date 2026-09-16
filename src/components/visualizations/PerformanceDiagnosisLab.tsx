import { useMemo, useState } from 'react'
import type {
  PerformanceDiagnosisVisualization,
  PerformanceStageId,
} from '../../features/performance/types'
import { getDiagnosisResult } from '../../utils/performance'
import {
  LayerMarker,
  PerformanceMetric,
  PerformanceMetricGrid,
  PerformancePanelHeading,
  SimulationNote,
} from './PerformanceLabShared'

const DIAGNOSIS_PATH = [
  '症状',
  '拆执行阶段',
  '找证据',
  '提出假设',
  '实施修改',
  '重新测量',
  '检查副作用',
]

export function PerformanceDiagnosisLab({
  visualization,
}: {
  visualization: PerformanceDiagnosisVisualization
}) {
  const [selectedStageId, setSelectedStageId] = useState<PerformanceStageId | undefined>()
  const [isMeasured, setIsMeasured] = useState(false)
  const data = visualization.diagnosis
  const result = useMemo(() => getDiagnosisResult(data, selectedStageId), [data, selectedStageId])
  const totalStageMinutes = data.stages.reduce((total, stage) => total + stage.durationMinutes, 0)
  const maximumStageMinutes = Math.max(...data.stages.map((stage) => stage.durationMinutes))

  return (
    <div className="performance-lab performance-lab--diagnosis">
      <LayerMarker layer="storage-execution" />
      <SimulationNote text={visualization.simulationNote} />

      <section
        className="performance-diagnosis__symptom"
        aria-labelledby="performance-symptom-title"
      >
        <PerformancePanelHeading
          eyebrow="11-1 · 症状"
          title="任务变慢以后，先不要急着改参数"
          description={data.symptom}
          id="performance-symptom-title"
        />
        <div className="performance-diagnosis__case">
          <div>
            <span>主案例</span>
            <strong>{visualization.case.label}</strong>
            <small>
              {visualization.case.factObject} · {visualization.case.analysisKey}
            </small>
          </div>
          <div>
            <span>常见观测证据</span>
            <strong>Query Plan · Stage · Task</strong>
            <small>Scan Bytes · Shuffle Bytes · 最长 Task</small>
          </div>
        </div>
        <ol className="performance-diagnosis__path" aria-label="性能诊断流程">
          {DIAGNOSIS_PATH.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
              {index < DIAGNOSIS_PATH.length - 1 && <i aria-hidden="true">→</i>}
            </li>
          ))}
        </ol>
      </section>

      <section className="performance-diagnosis__stages" aria-labelledby="performance-stages-title">
        <PerformancePanelHeading
          eyebrow="Stage evidence · 先做判断"
          title="主要耗时发生在哪里？"
          description="先点选一个阶段，再看与它对应的证据。阶段时长、总运行时间和最长 Task 要分开记录。"
          id="performance-stages-title"
        />
        <div className="performance-stage-list">
          {data.stages.map((stage, index) => (
            <button
              className={`performance-stage${selectedStageId === stage.id ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={selectedStageId === stage.id}
              onClick={() => {
                setSelectedStageId(stage.id)
                setIsMeasured(false)
              }}
              key={stage.id}
            >
              <span className="performance-stage__number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="performance-stage__body">
                <strong>{stage.label}</strong>
                <small>{stage.description}</small>
                <span className="performance-stage__track" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.max(4, (stage.durationMinutes / maximumStageMinutes) * 100)}%`,
                    }}
                  />
                </span>
              </span>
              <b>{stage.durationMinutes} min</b>
            </button>
          ))}
        </div>

        <div className="performance-diagnosis__summary">
          <PerformanceMetricGrid>
            <PerformanceMetric
              label="总运行时间"
              value={`${data.totalRuntimeMinutes} min`}
              detail="T+1 特征任务"
            />
            <PerformanceMetric
              label="阶段加总"
              value={`${totalStageMinutes} min`}
              detail="用于定位，不等同于并行引擎时钟"
            />
            <PerformanceMetric
              label="最长 Task"
              value={`${data.longestTask.durationMinutes} min`}
              detail={`${data.longestTask.taskId} · ${data.longestTask.stage}`}
            />
          </PerformanceMetricGrid>
        </div>
      </section>

      <section className="performance-diagnosis__evidence" aria-live="polite">
        {!result.selectedStage || !result.finding ? (
          <div className="performance-empty-state">
            <span>下一步</span>
            <strong>从上面的阶段记录开始，选择你认为最需要调查的地方。</strong>
            <p>不要先选优化手段；先留下一个可以被 Scan、Stage 或 Task 证据验证的假设。</p>
          </div>
        ) : (
          <>
            <div className="performance-evidence-heading">
              <div>
                <span className="eyebrow eyebrow--small">证据记录</span>
                <h3>
                  {result.selectedStage.label} ·{' '}
                  {result.isPrimaryStage ? '首要调查对象' : '候选调查对象'}
                </h3>
              </div>
              <span className={`performance-verdict${result.isPrimaryStage ? ' is-positive' : ''}`}>
                {result.isPrimaryStage ? '与最长阶段一致' : '还不能下结论'}
              </span>
            </div>
            <div className="performance-evidence-grid">
              <div>
                <span>看到的证据</span>
                <ul>
                  {result.finding.evidence.map((evidence) => (
                    <li key={evidence}>{evidence}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span>待验证假设</span>
                <p>{result.finding.hypothesis}</p>
              </div>
              <div>
                <span>下一步动作</span>
                <p>{result.finding.nextAction}</p>
              </div>
            </div>
            <button
              className="button button--primary button--small"
              type="button"
              onClick={() => setIsMeasured(true)}
            >
              记录假设并重新测量
            </button>
          </>
        )}
      </section>

      {isMeasured && (
        <section className="performance-diagnosis__remeasure" aria-live="polite">
          <PerformancePanelHeading
            eyebrow="重新测量 · 验证性修改"
            title="只验证 Scan 假设，其他阶段先不动"
            description={data.validation.change}
          />
          <PerformanceMetricGrid>
            <PerformanceMetric
              label="Scan"
              value={`${data.validation.beforeStageMinutes} → ${data.validation.afterStageMinutes} min`}
              detail="相对模拟值"
            />
            <PerformanceMetric
              label="总运行时间"
              value={`${data.validation.beforeRuntimeMinutes} → ${data.validation.afterRuntimeMinutes} min`}
              detail="仍需继续调查 Shuffle 和业务方案"
            />
            <PerformanceMetric
              label="副作用检查"
              value="待继续"
              detail={data.validation.sideEffect}
            />
          </PerformanceMetricGrid>
          <p className="performance-diagnosis__conclusion">
            {result.isPrimaryStage
              ? 'Scan 是这次最有证据支持的起点。修改有效，但“快了”只说明这个假设得到部分验证。'
              : '候选阶段的修改没有替代首要证据。回到最长阶段和相关观测，再决定是否继续。'}
          </p>
        </section>
      )}
    </div>
  )
}
