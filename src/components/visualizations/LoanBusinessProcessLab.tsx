import { useMemo, useState } from 'react'
import type {
  LoanBusinessProcessVisualization,
  LoanProcessMeasure,
  LoanProcessStep,
  LoanProcessStepId,
} from '../../types'

interface LoanBusinessProcessLabProps {
  visualization: LoanBusinessProcessVisualization
}

function findStep(
  steps: readonly LoanProcessStep[],
  stepId: LoanProcessStepId,
): LoanProcessStep | undefined {
  return steps.find((step) => step.id === stepId)
}

function findMeasure(
  measures: readonly LoanProcessMeasure[],
  measureId: LoanProcessMeasure['id'],
): LoanProcessMeasure | undefined {
  return measures.find((measure) => measure.id === measureId)
}

function ProcessStep({
  step,
  isSelected,
  onSelect,
}: {
  step: LoanProcessStep
  isSelected: boolean
  onSelect: (stepId: LoanProcessStepId) => void
}) {
  return (
    <button
      className={`loan-process__step${isSelected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(step.id)}
    >
      <span className="loan-process__step-index">
        {step.id === 'contract'
          ? '01'
          : step.id === 'disbursement'
            ? '02'
            : step.id === 'repayment'
              ? '03'
              : '04'}
      </span>
      <strong>{step.title}</strong>
      <small>{step.objectName}</small>
      <span className="loan-process__step-detail">{step.detail}</span>
    </button>
  )
}

function ProcessStepDetail({ step }: { step: LoanProcessStep }) {
  return (
    <div className="loan-process__step-detail-panel" aria-live="polite">
      <div className="loan-process__detail-heading">
        <div>
          <span>当前选中的业务环节</span>
          <strong>{step.title}</strong>
        </div>
        <b>{step.recordCount} 条记录</b>
      </div>
      <dl className="loan-process__detail-grid">
        <div>
          <dt>业务对象</dt>
          <dd>{step.objectName}</dd>
        </div>
        <div>
          <dt>发生的事件</dt>
          <dd>{step.event}</dd>
        </div>
        <div>
          <dt>记录示例</dt>
          <dd>{step.detail}</dd>
        </div>
      </dl>
    </div>
  )
}

function MeasureCard({
  measure,
  isSelected,
  onSelect,
}: {
  measure: LoanProcessMeasure
  isSelected: boolean
  onSelect: (measureId: LoanProcessMeasure['id']) => void
}) {
  return (
    <button
      className={`loan-process__measure${isSelected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(measure.id)}
    >
      <span>{measure.label}</span>
      <strong>{measure.displayValue}</strong>
      <code>{measure.field}</code>
    </button>
  )
}

export function LoanBusinessProcessLab({ visualization }: LoanBusinessProcessLabProps) {
  const [selectedStepId, setSelectedStepId] = useState<LoanProcessStepId>(
    visualization.defaultStepId,
  )
  const [selectedMeasureId, setSelectedMeasureId] = useState<LoanProcessMeasure['id']>(
    visualization.measures[0]?.id ?? 'contract-amount',
  )
  const [isConfirmed, setIsConfirmed] = useState(false)
  const selectedStep = useMemo(
    () => findStep(visualization.steps, selectedStepId) ?? visualization.steps[0],
    [selectedStepId, visualization.steps],
  )
  const selectedMeasure = useMemo(
    () => findMeasure(visualization.measures, selectedMeasureId) ?? visualization.measures[0],
    [selectedMeasureId, visualization.measures],
  )

  if (!selectedStep || !selectedMeasure) {
    return null
  }

  function reset() {
    setSelectedStepId(visualization.defaultStepId)
    setSelectedMeasureId(visualization.measures[0]?.id ?? 'contract-amount')
    setIsConfirmed(false)
  }

  return (
    <div className="loan-process-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">贷款业务过程选择</span>
          <p aria-live="polite">先确定要记录的环节，再讨论表该怎么设计。</p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={reset}>
          重置判断
        </button>
      </div>

      <section className="loan-process__route" aria-labelledby="loan-process-route-title">
        <div className="loan-process__section-heading">
          <div>
            <span className="eyebrow">BUSINESS PROCESS · 业务过程</span>
            <h3 id="loan-process-route-title">同一条贷款链上，记录的事情并不相同</h3>
          </div>
          <p>点击环节，查看它对应的业务对象、事件和记录数量。</p>
        </div>
        <div className="loan-process__chain">
          <div className="loan-process__customer">
            <span>客户</span>
            <strong>Customer</strong>
            <small>{visualization.customerLabel}</small>
          </div>
          {visualization.steps.map((step) => (
            <div className="loan-process__step-wrap" key={step.id}>
              <span className="loan-process__chain-arrow" aria-hidden="true">
                ↓
              </span>
              <ProcessStep
                step={step}
                isSelected={step.id === selectedStep.id}
                onSelect={(stepId) => {
                  setSelectedStepId(stepId)
                  setIsConfirmed(false)
                }}
              />
            </div>
          ))}
        </div>
        <div className="loan-process__contract-note">
          <span>本例合同</span>
          <strong>LoanContract</strong>
          <code>{visualization.contractLabel}</code>
          <p>合同约定的额度，不等于已经形成的贷款本金。</p>
        </div>
        <ProcessStepDetail step={selectedStep} />
      </section>

      <section className="loan-process__question" aria-labelledby="loan-process-question-title">
        <div className="loan-process__section-heading">
          <div>
            <span className="eyebrow">SAME QUESTION · 同一句问题</span>
            <h3 id="loan-process-question-title">“今年新增贷款是多少？”</h3>
          </div>
          <p>选择一个数字，先看清它究竟在回答哪件事。</p>
        </div>
        <div className="loan-process__measures">
          {visualization.measures.map((measure) => (
            <MeasureCard
              key={measure.id}
              measure={measure}
              isSelected={measure.id === selectedMeasure.id}
              onSelect={setSelectedMeasureId}
            />
          ))}
        </div>
        <div className="loan-process__measure-detail" aria-live="polite">
          <span>这个数字的业务含义</span>
          <strong>{selectedMeasure.label}</strong>
          <p>{selectedMeasure.description}</p>
        </div>
      </section>

      <section
        className="loan-process__declaration"
        aria-labelledby="loan-process-declaration-title"
      >
        <div className="loan-process__declaration-heading">
          <div>
            <span className="eyebrow">DECLARE · 写下判断</span>
            <h3 id="loan-process-declaration-title">把要记录的事情说成一句话</h3>
          </div>
          {isConfirmed && <span className="loan-process__confirmed">已确认</span>}
        </div>
        <div className="loan-process__declaration-grid">
          <div>
            <span>Business Process</span>
            <strong>{selectedStep.businessProcess}</strong>
          </div>
          <div>
            <span>分析对象</span>
            <strong>{selectedStep.analysisObject}</strong>
          </div>
          <div>
            <span>事件</span>
            <strong>{selectedStep.event}</strong>
          </div>
        </div>
        <p className="loan-process__distinction">
          业务对象 ≠ 业务过程 ≠ 分析事实。默认分析“贷款放款”时，本例的声明是：
          <b>Business Process：贷款放款；分析对象：LoanNote；事件：实际放款。</b>
        </p>
        <button
          className="button button--primary button--small"
          type="button"
          onClick={() => setIsConfirmed(true)}
        >
          确认当前业务过程
        </button>
      </section>
    </div>
  )
}

export type { LoanBusinessProcessLabProps }
