import { useMemo, useState } from 'react'
import type {
  BankingFactTypeDefinition,
  BankingFactTypeId,
  BankingFactTypesVisualization,
  LoanNoteLifecycleDefinition,
  TeachingTableData,
} from '../../types'
import { getBankingFactType, getLoanNoteLifecycleSnapshot } from '../../utils/banking-fact-types'

interface BankingFactTypesLabProps {
  visualization: BankingFactTypesVisualization
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
        <caption>{caption}</caption>
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

function FactTypeCard({
  factType,
  index,
  isSelected,
  onSelect,
}: {
  factType: BankingFactTypeDefinition
  index: number
  isSelected: boolean
  onSelect: (id: BankingFactTypeId) => void
}) {
  return (
    <button
      className={`banking-facts__type-card banking-facts__type-card--${factType.id}${isSelected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(factType.id)}
    >
      <span className="banking-facts__type-number">{String(index + 1).padStart(2, '0')}</span>
      <span className="banking-facts__type-label">{factType.label}</span>
      <strong>{factType.englishName}</strong>
      <small>{factType.rowMeaning}</small>
    </button>
  )
}

function LifecycleRail({
  lifecycle,
  selectedIndex,
  onSelect,
}: {
  lifecycle: LoanNoteLifecycleDefinition
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  return (
    <div className="banking-facts__lifecycle">
      <div className="banking-facts__lifecycle-heading">
        <div>
          <span className="eyebrow">LOAN NOTE · 累积快照</span>
          <h4>同一个 LoanNote，随着生命周期补齐里程碑</h4>
        </div>
        <span>当前：{lifecycle.milestones[selectedIndex]?.status}</span>
      </div>
      <div className="banking-facts__milestones" role="list" aria-label="LoanNote 生命周期里程碑">
        {lifecycle.milestones.map((milestone, index) => (
          <button
            className={`banking-facts__milestone${index <= selectedIndex ? ' is-reached' : ''}${index === selectedIndex ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={index === selectedIndex}
            onClick={() => onSelect(index)}
            key={milestone.id}
          >
            <i aria-hidden="true" />
            <strong>{milestone.label}</strong>
            <small>{milestone.date}</small>
          </button>
        ))}
      </div>
      <p className="banking-facts__milestone-note">
        {lifecycle.milestones[selectedIndex]?.description}
      </p>
    </div>
  )
}

function FactTypeDetail({
  factType,
  lifecycle,
  lifecycleIndex,
  onLifecycleSelect,
}: {
  factType: BankingFactTypeDefinition
  lifecycle: LoanNoteLifecycleDefinition
  lifecycleIndex: number
  onLifecycleSelect: (index: number) => void
}) {
  const data =
    factType.id === 'accumulating-snapshot'
      ? {
          columns: [
            'note_id',
            'disbursed_date',
            'first_due_date',
            'first_repayment_date',
            'overdue_date',
            'settled_date',
            'current_status',
          ],
          rows: [getLoanNoteLifecycleSnapshot(lifecycle, lifecycleIndex)],
        }
      : { columns: factType.columns, rows: factType.rows }

  return (
    <section
      className={`banking-facts__detail banking-facts__detail--${factType.id}`}
      aria-live="polite"
    >
      <div className="banking-facts__detail-heading">
        <div>
          <span>{factType.label}</span>
          <h3>{factType.englishName}</h3>
        </div>
        <strong>
          {factType.id === 'transaction'
            ? '事件'
            : factType.id === 'periodic-snapshot'
              ? '状态'
              : '生命周期'}
        </strong>
      </div>
      <dl className="banking-facts__definition-grid">
        <div>
          <dt>一行代表什么</dt>
          <dd>{factType.rowMeaning}</dd>
        </div>
        <div>
          <dt>什么时候新增或更新</dt>
          <dd>{factType.trigger}</dd>
        </div>
        <div>
          <dt>时间语义</dt>
          <dd>{factType.timeSemantics}</dd>
        </div>
      </dl>
      <div className="banking-facts__question-grid">
        <div>
          <span>适合回答</span>
          <p>{factType.canAnswer}</p>
        </div>
        <div>
          <span>不要拿它回答</span>
          <p>{factType.cannotAnswer}</p>
        </div>
      </div>
      {factType.id === 'accumulating-snapshot' && (
        <LifecycleRail
          lifecycle={lifecycle}
          selectedIndex={lifecycleIndex}
          onSelect={onLifecycleSelect}
        />
      )}
      <DataTable data={data} caption={`${factType.label}示例数据`} />
    </section>
  )
}

export function BankingFactTypesLab({ visualization }: BankingFactTypesLabProps) {
  const [selectedId, setSelectedId] = useState<BankingFactTypeId>('transaction')
  const [lifecycleIndex, setLifecycleIndex] = useState(0)
  const selectedFactType = useMemo(
    () => getBankingFactType(visualization.factTypes, selectedId) ?? visualization.factTypes[0],
    [selectedId, visualization.factTypes],
  )

  if (!selectedFactType) {
    return null
  }

  function reset() {
    setSelectedId('transaction')
    setLifecycleIndex(0)
  }

  return (
    <div className="banking-facts-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">事实表形态对照台</span>
          <p aria-live="polite">事件、状态、生命周期有不同的行含义，也有不同的时间问题。</p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={reset}>
          重置对照
        </button>
      </div>
      <section className="banking-facts__chooser" aria-labelledby="banking-facts-chooser-title">
        <div className="banking-facts__section-heading">
          <div>
            <span className="eyebrow">THREE FACT SHAPES · 三种事实表</span>
            <h3 id="banking-facts-chooser-title">事件、状态、生命周期不是同一种事实</h3>
          </div>
          <p>先看三组区别，再选一组读完整的行含义和时间语义。</p>
        </div>
        <div className="banking-facts__type-grid">
          {visualization.factTypes.map((factType, index) => (
            <FactTypeCard
              key={factType.id}
              factType={factType}
              index={index}
              isSelected={factType.id === selectedFactType.id}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      </section>
      <FactTypeDetail
        factType={selectedFactType}
        lifecycle={visualization.loanNoteLifecycle}
        lifecycleIndex={lifecycleIndex}
        onLifecycleSelect={setLifecycleIndex}
      />
    </div>
  )
}

export type { BankingFactTypesLabProps }
