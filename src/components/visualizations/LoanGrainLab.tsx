import { useMemo, useState } from 'react'
import type {
  LoanGrainErrorDemo,
  LoanGrainId,
  LoanGrainOption,
  LoanGrainVisualization,
  TeachingTableData,
} from '../../types'
import { calculateLoanGrainErrorResult, getLoanGrainOption } from '../../utils/loan-grain'

interface LoanGrainLabProps {
  visualization: LoanGrainVisualization
}

type LoanGrainErrorStep = 'joined' | 'calculated' | 'fixed'

const errorStepLabels: Record<LoanGrainErrorStep, string> = {
  joined: '合同金额被带到了两笔借据上',
  calculated: 'SUM 暴露了 Grain 错误',
  fixed: '合同金额先回到合同 Grain',
}

function formatCell(value: string | number | undefined): string {
  if (typeof value === 'number') {
    return value.toLocaleString('zh-CN')
  }

  return value ?? '—'
}

function DataTable({ data, caption }: { data: TeachingTableData; caption: string }) {
  return (
    <div className="banking-lab__table-wrap">
      <table className="banking-lab__table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th key={column}>
                <code>{column}</code>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr
              key={`${rowIndex}-${data.columns.map((column) => String(row[column] ?? '')).join('-')}`}
            >
              {data.columns.map((column) => (
                <td key={column}>{formatCell(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GrainOptionCard({
  option,
  index,
  isSelected,
  onSelect,
}: {
  option: LoanGrainOption
  index: number
  isSelected: boolean
  onSelect: (grainId: LoanGrainId) => void
}) {
  return (
    <button
      className={`loan-grain__option${isSelected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(option.id)}
    >
      <span>{String(index + 1).padStart(2, '0')}</span>
      <strong>{option.label}</strong>
      <small>
        {option.rows.length} 行 · {option.identity}
      </small>
    </button>
  )
}

function GrainAnswer({ option }: { option: LoanGrainOption }) {
  return (
    <div className="loan-grain__answer-grid">
      <div>
        <span>当前一行代表</span>
        <strong>{option.statement}</strong>
        <p>{option.rowMeaning}</p>
      </div>
      <div>
        <span>identity / 主键</span>
        <code>
          {option.identity} / {option.primaryKey}
        </code>
      </div>
      <div>
        <span>匹配的金额</span>
        <strong>{option.amountValue}</strong>
        <code>
          {option.amountField} · {option.amountLabel}
        </code>
      </div>
      <div>
        <span>当前行数</span>
        <strong>{option.rows.length}</strong>
        <p>示例数据中的记录数</p>
      </div>
    </div>
  )
}

function GrainQuestions({ option }: { option: LoanGrainOption }) {
  return (
    <div className="loan-grain__questions">
      <div>
        <span>可以回答</span>
        <ul>
          {option.canAnswer.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </div>
      <div>
        <span>不能直接回答</span>
        <ul>
          {option.cannotAnswer.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function GrainErrorLab({ demo }: { demo: LoanGrainErrorDemo }) {
  const [step, setStep] = useState<LoanGrainErrorStep>('joined')
  const result = useMemo(() => calculateLoanGrainErrorResult(demo), [demo])
  const isCalculated = step !== 'joined'
  const isFixed = step === 'fixed'

  function reset() {
    setStep('joined')
  }

  return (
    <section className="loan-grain__error" aria-labelledby="loan-grain-error-title">
      <div className="loan-grain__section-heading">
        <div>
          <span className="eyebrow">GRAIN ERROR · Join 放大</span>
          <h3 id="loan-grain-error-title">合同金额 Join 到借据后，为什么不能直接 SUM？</h3>
        </div>
        <p aria-live="polite">{errorStepLabels[step]}</p>
      </div>
      <div className="loan-grain__error-flow" aria-label="Grain 错误传播路径">
        <span className={step === 'joined' ? 'is-current' : 'is-done'}>合同 Grain</span>
        <i aria-hidden="true">→</i>
        <span className={isCalculated ? 'is-current' : ''}>Join 到借据</span>
        <i aria-hidden="true">→</i>
        <span className={isFixed ? 'is-current' : ''}>回到匹配 Grain</span>
      </div>
      <div className={`loan-grain__error-models loan-grain__error-models--${step}`}>
        <article className="loan-grain__error-model loan-grain__error-model--wrong">
          <div className="loan-grain__error-heading">
            <div>
              <span>错误做法</span>
              <strong>一份合同的金额被复制给两笔借据</strong>
            </div>
            <code>{demo.wrongMeasure}</code>
          </div>
          <DataTable
            data={{ columns: demo.wrongColumns, rows: demo.wrongRows }}
            caption="错误 Join：合同金额在借据 Grain 上重复出现"
          />
          <code className="loan-grain__sql">{demo.wrongSql}</code>
        </article>
        {isFixed && (
          <article className="loan-grain__error-model loan-grain__error-model--fixed">
            <div className="loan-grain__error-heading">
              <div>
                <span>修复做法</span>
                <strong>先按合同 Grain 保留一行</strong>
              </div>
              <code>{demo.fixedMeasure}</code>
            </div>
            <DataTable
              data={{ columns: demo.fixedColumns, rows: demo.fixedRows }}
              caption="修复后：合同金额只在合同 Grain 上计算"
            />
            <code className="loan-grain__sql">{demo.fixedSql}</code>
          </article>
        )}
      </div>
      <div className="loan-grain__error-actions">
        <button
          className="button button--primary button--small"
          type="button"
          disabled={isCalculated}
          onClick={() => setStep('calculated')}
        >
          执行 SUM(contract_amount)
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={!isCalculated || isFixed}
          onClick={() => setStep('fixed')}
        >
          修复 Grain
        </button>
        <button className="button button--quiet button--small" type="button" onClick={reset}>
          重置演示
        </button>
      </div>
      <div
        className={`loan-grain__error-result loan-grain__error-result--${step}`}
        aria-live="polite"
      >
        <div>
          <span>正确的合同金额</span>
          <strong>¥{result.actualContractAmount.toLocaleString('zh-CN')}</strong>
        </div>
        <div>
          <span>{isFixed ? '修复后 SUM' : '错误 SUM'}</span>
          <strong>
            {isCalculated
              ? `¥${(isFixed ? result.fixedTotal : result.wrongTotal).toLocaleString('zh-CN')}`
              : '—'}
          </strong>
        </div>
        <p>
          {step === 'joined' && '先观察 Join 结果，再执行聚合。'}
          {step === 'calculated' && (
            <>
              Grain 错 → Join 放大 → 指标算错：错误结果多了 ¥
              {result.wrongDifference.toLocaleString('zh-CN')}。
            </>
          )}
          {step === 'fixed' && (
            <>
              合同金额与合同 Grain 对齐，SUM 后回到 ¥{result.fixedTotal.toLocaleString('zh-CN')}。
            </>
          )}
        </p>
      </div>
    </section>
  )
}

export function LoanGrainLab({ visualization }: LoanGrainLabProps) {
  const defaultOption =
    getLoanGrainOption(visualization.options, 'loan-note') ?? visualization.options[0]
  const [selectedGrainId, setSelectedGrainId] = useState<LoanGrainId>(
    defaultOption?.id ?? 'loan-note',
  )
  const selectedOption = useMemo(
    () => getLoanGrainOption(visualization.options, selectedGrainId) ?? defaultOption,
    [defaultOption, selectedGrainId, visualization.options],
  )

  if (!selectedOption) {
    return null
  }

  function reset() {
    setSelectedGrainId(defaultOption?.id ?? 'loan-note')
  }

  return (
    <div className="loan-grain-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">贷款链 Grain 实验台</span>
          <p aria-live="polite">每切换一次 Grain，行含义、identity 和可回答的问题都要一起重读。</p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={reset}>
          重置 Grain
        </button>
      </div>
      <section className="loan-grain__selector" aria-labelledby="loan-grain-selector-title">
        <div className="loan-grain__section-heading">
          <div>
            <span className="eyebrow">ONE ROW · 一行的含义</span>
            <h3 id="loan-grain-selector-title">同一份贷款链，至少有三种 Grain</h3>
          </div>
          <p>合同 C001 约定 100 万，下面的三张表记录的是三类不同事件。</p>
        </div>
        <div className="loan-grain__options" role="list">
          {visualization.options.map((option, index) => (
            <GrainOptionCard
              key={option.id}
              option={option}
              index={index}
              isSelected={option.id === selectedOption.id}
              onSelect={setSelectedGrainId}
            />
          ))}
        </div>
        <div className="loan-grain__panel" aria-live="polite">
          <GrainAnswer option={selectedOption} />
          <GrainQuestions option={selectedOption} />
          <DataTable
            data={{ columns: selectedOption.columns, rows: selectedOption.rows }}
            caption={`${selectedOption.label}示例数据`}
          />
        </div>
      </section>
      <GrainErrorLab demo={visualization.errorDemo} />
    </div>
  )
}

export type { LoanGrainLabProps }
