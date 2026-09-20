import type { LessonComparison } from '../../content/types'
import { getCompareColumnHeadingId } from '../../utils/heading-id'

export interface CompareSplitProps {
  comparison: LessonComparison
  headingId?: string
}

export function CompareSplit({ comparison, headingId = 'compare-split-title' }: CompareSplitProps) {
  return (
    <section className="compare-split" aria-labelledby={headingId}>
      <div className="section-heading section-heading--compact">
        <span className="eyebrow">放在一起看</span>
        <h2 id={headingId}>{comparison.title}</h2>
        {comparison.intro && <p>{comparison.intro}</p>}
      </div>
      <div className="compare-split__grid">
        {comparison.columns.map((column, columnIndex) => (
          <article className="compare-split__column" key={column.label}>
            <span className="compare-split__label">{column.label}</span>
            <h3 id={getCompareColumnHeadingId(headingId, columnIndex)}>{column.title}</h3>
            <ul>
              {column.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
