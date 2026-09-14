import type {
  LessonCodeExample,
  LessonComparison,
  LessonSection,
  LessonVisualization,
} from '../../content/types'
import type { Lesson } from '../../data/course'
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import { getCodeHighlightKey, type CodeHighlightMap } from '../../utils/code-highlight'
import {
  BusinessSystemFlow,
  LakehouseArchitectureLab,
  LineageGraph,
  MetricDefinitionLab,
  ModelingIntro,
  PipelineFlow,
  PerformanceLab,
  SlowlyChangingDimension,
  SqlTransformationWorkbench,
  StarSchemaFlow,
} from '../visualizations'
import { CodeBlock } from './CodeBlock'
import { CompareSplit } from './CompareSplit'
import { EngineeringNote } from './EngineeringNote'
import { Pitfall } from './Pitfall'
import { Takeaway } from './Takeaway'

interface LessonSectionRendererProps {
  lesson: Lesson
  sections: LessonSection[]
  legacyVisualization?: LessonVisualization
  legacyComparison?: LessonComparison
  legacyCode?: LessonCodeExample
  codeHighlights?: CodeHighlightMap
  locale?: Locale
  engineeringTip?: string
  pitfalls?: string[]
}

interface VisualizationBlockProps {
  lessonId: string
  visualization: LessonVisualization
  eyebrow: string
  title: string
  description: string
  blockId: string
}

function NarrativeSection({
  section,
  index,
  composed,
}: {
  section: Extract<LessonSection, { title: string; paragraphs: string[] }>
  index: number
  composed?: boolean
}) {
  return (
    <article className={`lesson-section${composed ? ' lesson-section--composed' : ''}`}>
      <div className="lesson-section__index">{String(index + 1).padStart(2, '0')}</div>
      <div>
        <h2>{section.title}</h2>
        {section.paragraphs.map((paragraph, paragraphIndex) => (
          <p key={`${paragraphIndex}-${paragraph}`}>{paragraph}</p>
        ))}
        {section.bullets && section.bullets.length > 0 && (
          <ul className="check-list">
            {section.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

function VisualizationBody({ visualization }: { visualization: LessonVisualization }) {
  switch (visualization.kind) {
    case 'systems':
      return (
        <BusinessSystemFlow
          systems={visualization.systems}
          warehouseLabel={visualization.warehouseLabel}
          outputs={visualization.outputs}
        />
      )
    case 'pipeline':
      return <PipelineFlow stages={visualization.stages} />
    case 'lineage':
      return (
        <LineageGraph
          nodes={visualization.nodes}
          edges={visualization.edges}
          investigationEvent={visualization.investigationEvent}
        />
      )
    case 'modeling-intro':
      return <ModelingIntro visualization={visualization} />
    case 'star-schema':
      return <StarSchemaFlow visualization={visualization} />
    case 'scd':
      return <SlowlyChangingDimension visualization={visualization} />
    case 'metric-definition':
      return <MetricDefinitionLab visualization={visualization} />
    case 'lakehouse':
      return <LakehouseArchitectureLab visualization={visualization} />
    case 'sql-transformation':
      return <SqlTransformationWorkbench visualization={visualization} />
    case 'performance-lab':
      return <PerformanceLab visualization={visualization} />
  }
}

function VisualizationBlock({
  lessonId,
  visualization,
  eyebrow,
  title,
  description,
  blockId,
}: VisualizationBlockProps) {
  const headingId = `${lessonId}-${blockId}-title`

  return (
    <section className="visualization-section" aria-labelledby={headingId}>
      <div className="section-heading">
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
      <VisualizationBody visualization={visualization} />
    </section>
  )
}

function getLegacyVisualizationCopy(visualization: LessonVisualization) {
  switch (visualization.kind) {
    case 'star-schema':
      return {
        eyebrow: '交互式建模实验',
        title: '从一张大宽表，走到一颗星',
        description:
          '先观察中央事实表和周围维度，再切换粒度，亲眼看见粒度不一致为什么会让金额重复计算。',
      }
    case 'modeling-intro':
      return {
        eyebrow: '建模导入',
        title: '先从一行原始数据开始',
        description: '先观察字段混在一起的订单记录，再用四步建模思路定义它的业务含义。',
      }
    case 'scd':
      return {
        eyebrow: 'SCD Type 2 交互实验',
        title: '直接 UPDATE，历史去了哪里？',
        description:
          '先让错误方案产生历史冲突，再切换到 SCD Type 2，观察时间点查询如何命中正确版本。',
      }
    case 'metric-definition':
      return {
        eyebrow: '指标口径交互实验',
        title: '改变口径，数字就会改变',
        description:
          '先选择状态、退款、时间和粒度规则，再追踪哪些订单参与计算，以及最终数字如何被逐步加出来。',
      }
    case 'sql-transformation':
      return {
        eyebrow: 'SQL 工作台 · 表快照实验',
        title: '昨天的销售额到底是多少？',
        description:
          '先选择目标粒度，再逐步执行去重、JOIN、聚合和分区重跑，观察每一行数据如何改变。',
      }
    default:
      return {
        eyebrow: '动手实验',
        title: '把概念变成一条可观察的数据流',
        description: '操作下面的图，观察数据如何进入系统、被加工，或沿着依赖关系产生影响。',
      }
  }
}

function LegacyTeachingNotes({
  engineeringTip,
  pitfalls,
  locale,
}: {
  engineeringTip?: string
  pitfalls?: string[]
  locale: Locale
}) {
  const hasPitfalls = Boolean(pitfalls && pitfalls.length > 0)

  if (!engineeringTip && !hasPitfalls) {
    return null
  }

  return (
    <section className="lesson-insights" aria-label={getMessage('teachingNotes', locale)}>
      {engineeringTip && <EngineeringNote text={engineeringTip} title="把定义放回真实场景" />}
      {hasPitfalls && <Pitfall text={pitfalls?.join(' ') ?? ''} title="记住边界，不要背成口号" />}
    </section>
  )
}

function getHighlightedCode(
  codeHighlights: CodeHighlightMap | undefined,
  language: string,
  code: string,
) {
  return codeHighlights?.[getCodeHighlightKey(language, code)]
}

function LegacyBlocks({
  lesson,
  legacyVisualization,
  legacyComparison,
  legacyCode,
  codeHighlights,
  engineeringTip,
  pitfalls,
  locale = DEFAULT_LOCALE,
}: Omit<LessonSectionRendererProps, 'sections'>) {
  const visualizationCopy = legacyVisualization
    ? getLegacyVisualizationCopy(legacyVisualization)
    : undefined

  return (
    <>
      {legacyVisualization && visualizationCopy && (
        <VisualizationBlock
          lessonId={lesson.id}
          visualization={legacyVisualization}
          {...visualizationCopy}
          blockId="legacy-visualization"
        />
      )}
      {legacyComparison && (
        <CompareSplit
          comparison={legacyComparison}
          headingId={`${lesson.id}-legacy-compare-title`}
        />
      )}
      {legacyCode && (
        <CodeBlock
          {...legacyCode}
          highlightedCode={getHighlightedCode(codeHighlights, legacyCode.language, legacyCode.code)}
          headingId={`${lesson.id}-legacy-code-title`}
        />
      )}
      <LegacyTeachingNotes engineeringTip={engineeringTip} pitfalls={pitfalls} locale={locale} />
    </>
  )
}

function isNarrativeSection(
  section: LessonSection,
): section is Extract<LessonSection, { paragraphs: string[] }> {
  return 'paragraphs' in section
}

function isLegacyNarrativeSection(
  section: LessonSection,
): section is Extract<LessonSection, { paragraphs: string[] }> {
  return isNarrativeSection(section) && section.kind === undefined
}

function renderSection(
  section: LessonSection,
  lessonId: string,
  index: number,
  codeHighlights?: CodeHighlightMap,
) {
  switch (section.kind) {
    case 'compare':
      return (
        <CompareSplit
          comparison={section}
          headingId={`${lessonId}-section-${index}-compare-title`}
          key={`compare-${index}`}
        />
      )
    case 'sql':
      return (
        <CodeBlock
          {...section}
          highlightedCode={getHighlightedCode(codeHighlights, section.language, section.code)}
          headingId={`${lessonId}-section-${index}-sql-title`}
          key={`sql-${index}`}
        />
      )
    case 'visualization':
      return (
        <VisualizationBlock
          {...section}
          blockId={`section-${index}`}
          key={`visualization-${index}`}
          lessonId={lessonId}
        />
      )
    case 'takeaway':
      return (
        <Takeaway
          title={section.title}
          text={section.text}
          bullets={section.bullets}
          headingId={`${lessonId}-section-${index}-takeaway-title`}
          key={`takeaway-${index}`}
        />
      )
    case 'engineering-note':
      return (
        <EngineeringNote text={section.text} title={section.title} key={`engineering-${index}`} />
      )
    case 'pitfall':
      return <Pitfall text={section.text} title={section.title} key={`pitfall-${index}`} />
    case 'narrative':
      return (
        <NarrativeSection section={section} index={index} composed key={`narrative-${index}`} />
      )
    default:
      if (!isNarrativeSection(section)) {
        return null
      }

      return (
        <NarrativeSection section={section} index={index} composed key={`narrative-${index}`} />
      )
  }
}

export function LessonSectionRenderer({
  lesson,
  sections,
  legacyVisualization,
  legacyComparison,
  legacyCode,
  codeHighlights,
  locale = DEFAULT_LOCALE,
  engineeringTip,
  pitfalls,
}: LessonSectionRendererProps) {
  const legacySections = sections.filter(isLegacyNarrativeSection)
  const hasComposedSections = legacySections.length !== sections.length

  if (!hasComposedSections) {
    return (
      <>
        <section className="lesson-sections" aria-label={getMessage('lessonBody', locale)}>
          {legacySections.map((section, index) => (
            <NarrativeSection section={section} index={index} key={`${section.title}-${index}`} />
          ))}
        </section>
        <LegacyBlocks
          lesson={lesson}
          legacyVisualization={legacyVisualization}
          legacyComparison={legacyComparison}
          legacyCode={legacyCode}
          codeHighlights={codeHighlights}
          locale={locale}
          engineeringTip={engineeringTip}
          pitfalls={pitfalls}
        />
      </>
    )
  }

  return (
    <section className="lesson-sequence" aria-label={getMessage('lessonContent', locale)}>
      {sections.map((section, index) => renderSection(section, lesson.id, index, codeHighlights))}
      <LegacyBlocks
        lesson={lesson}
        legacyVisualization={legacyVisualization}
        legacyComparison={legacyComparison}
        legacyCode={legacyCode}
        codeHighlights={codeHighlights}
        locale={locale}
        engineeringTip={engineeringTip}
        pitfalls={pitfalls}
      />
    </section>
  )
}

export type { LessonSectionRendererProps, VisualizationBlockProps }
