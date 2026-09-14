import type { Lesson } from '../../data/course'
import type { LessonContent as LessonContentData } from '../../content/types'
import type { CodeHighlightMap } from '../../utils/code-highlight'
import { ConceptCard } from './ConceptCard'
import { LessonSectionRenderer } from './LessonSectionRenderer'

interface LessonContentProps {
  lesson: Lesson
  content: LessonContentData
  codeHighlights?: CodeHighlightMap
}

export function LessonContent({ lesson, content, codeHighlights }: LessonContentProps) {
  return (
    <div className="lesson-content">
      {content.opening && (
        <section className="lesson-opening" aria-labelledby={`${lesson.id}-opening-title`}>
          <div className="lesson-opening__heading">
            <span className="eyebrow">{content.opening.eyebrow}</span>
            <h2 id={`${lesson.id}-opening-title`}>{content.opening.title}</h2>
            <p>{content.opening.intro}</p>
          </div>
          <div className="lesson-opening__cards">
            {content.opening.cards.map((card) => (
              <article className="lesson-opening__card" key={card.label}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.detail}</small>
              </article>
            ))}
          </div>
          <p className="lesson-opening__question">{content.opening.question}</p>
        </section>
      )}

      <ConceptCard term={content.concept.term} definition={content.concept.definition} />

      <LessonSectionRenderer
        lesson={lesson}
        sections={content.sections}
        legacyVisualization={content.visualization}
        legacyComparison={content.comparison}
        legacyCode={content.code}
        codeHighlights={codeHighlights}
        engineeringTip={content.engineeringTip}
        pitfalls={content.pitfalls}
      />
    </div>
  )
}
