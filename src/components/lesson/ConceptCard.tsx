interface ConceptCardProps {
  term: string
  definition: string
  /** Anchor id from `getConceptHeadingId` (see `src/utils/heading-id.ts`). */
  headingId: string
}

export function ConceptCard({ term, definition, headingId }: ConceptCardProps) {
  return (
    <article className="concept-card">
      <div className="concept-card__label">
        <span className="dot dot--teal" aria-hidden="true" />
        核心概念
      </div>
      <div className="concept-card__content">
        <h2 id={headingId}>{term}</h2>
        <p>{definition}</p>
      </div>
    </article>
  )
}
