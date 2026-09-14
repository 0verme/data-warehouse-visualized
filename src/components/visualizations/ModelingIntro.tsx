import type { ModelingIntroVisualization } from '../../types'

interface ModelingIntroProps {
  visualization: ModelingIntroVisualization
}

function RawOrderTable({ visualization }: ModelingIntroProps) {
  return (
    <div className="modeling-intro__table-wrap">
      <table className="modeling-intro__table">
        <caption>原始订单数据：订单、用户、商品和店铺字段暂时混在一起</caption>
        <thead>
          <tr>
            {visualization.rawTable.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visualization.rawTable.rows.map((row, rowIndex) => (
            <tr
              key={`${rowIndex}-${visualization.rawTable.columns
                .map((column) => String(row[column] ?? ''))
                .join('-')}`}
            >
              {visualization.rawTable.columns.map((column) => (
                <td key={column}>{String(row[column] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ModelingIntro({ visualization }: ModelingIntroProps) {
  return (
    <div className="modeling-intro">
      <div className="modeling-intro__table-heading">
        <div>
          <span className="eyebrow eyebrow--small">原始记录</span>
          <h3>先不要拆表，先给“一行”下定义</h3>
        </div>
        <p>同一份数据可以有不同的粒度；字段名本身不会替你做出这个决定。</p>
      </div>
      <RawOrderTable visualization={visualization} />
      <div className="modeling-intro__steps" aria-label="四步建模思路">
        {visualization.steps.map((step, index) => (
          <article className="modeling-intro__step" key={step.id}>
            <span className="modeling-intro__step-number">0{index + 1}</span>
            <h4>{step.title}</h4>
            <p>{step.description}</p>
            <code>{step.example}</code>
          </article>
        ))}
      </div>
    </div>
  )
}

export type { ModelingIntroProps }
