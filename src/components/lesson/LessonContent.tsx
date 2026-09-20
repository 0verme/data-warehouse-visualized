import type { Lesson } from '../../data/course'
import type { LessonContent as LessonContentData } from '../../content/types'
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale'
import type { CodeHighlightMap } from '../../utils/code-highlight'
import { getConceptHeadingId, getOpeningHeadingId } from '../../utils/heading-id'
import { ConceptCard } from './ConceptCard'
import { LessonSectionRenderer } from './LessonSectionRenderer'

interface LessonContentProps {
  lesson: Lesson
  content: LessonContentData
  codeHighlights?: CodeHighlightMap
  locale?: Locale
}

export function LessonContent({
  lesson,
  content,
  codeHighlights,
  locale = DEFAULT_LOCALE,
}: LessonContentProps) {
  return (
    <div className="lesson-content">
      {content.opening && (
        <section className="lesson-opening" aria-labelledby={getOpeningHeadingId(lesson.id)}>
          <div className="lesson-opening__heading">
            <span className="eyebrow">{content.opening.eyebrow}</span>
            <h2 id={getOpeningHeadingId(lesson.id)}>{content.opening.title}</h2>
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

      <ConceptCard
        term={content.concept.term}
        definition={content.concept.definition}
        headingId={getConceptHeadingId(lesson.id)}
      />

      <LessonSectionRenderer
        lesson={lesson}
        sections={content.sections}
        legacyVisualization={content.visualization}
        legacyComparison={content.comparison}
        legacyCode={content.code}
        codeHighlights={codeHighlights}
        locale={locale}
        engineeringTip={content.engineeringTip}
        pitfalls={content.pitfalls}
      />
    </div>
  )
}
