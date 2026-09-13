import type { LessonComparison } from '../../content/types'

interface CompareCardProps {
  comparison: LessonComparison
}

export function CompareCard({ comparison }: CompareCardProps) {
  return (
    <section className="compare-card" aria-labelledby="compare-card-title">
      <div className="section-heading section-heading--compact">
        <span className="eyebrow">放在一起看</span>
        <h2 id="compare-card-title">{comparison.title}</h2>
        {comparison.intro && <p>{comparison.intro}</p>}
      </div>
      <div className="compare-card__grid">
        {comparison.columns.map((column) => (
          <article className="compare-card__column" key={column.label}>
            <span className="compare-card__label">{column.label}</span>
            <h3>{column.title}</h3>
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
