import type { Lesson } from '../../data/course'
import type { LessonContent as LessonContentData } from '../../content/types'
import { CodeBlock } from './CodeBlock'
import { CompareCard } from './CompareCard'
import { ConceptCard } from './ConceptCard'
import { InsightCard } from './InsightCard'
import {
  BusinessSystemFlow,
  LineageGraph,
  ModelingIntro,
  PipelineFlow,
  SlowlyChangingDimension,
  StarSchemaFlow,
} from '../visualizations'

interface LessonContentProps {
  lesson: Lesson
  content: LessonContentData
}

export function LessonContent({ lesson, content }: LessonContentProps) {
  return (
    <div className="lesson-content">
      <ConceptCard term={content.concept.term} definition={content.concept.definition} />

      <section className="lesson-sections" aria-label="课程正文">
        {content.sections.map((section, index) => (
          <article className="lesson-section" key={section.title}>
            <div className="lesson-section__index">0{index + 1}</div>
            <div>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="check-list">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </section>

      {content.visualization && (
        <section
          className="visualization-section"
          aria-labelledby={`${lesson.id}-visualization-title`}
        >
          <div className="section-heading">
            {content.visualization.kind === 'star-schema' ? (
              <>
                <span className="eyebrow">交互式建模实验</span>
                <h2 id={`${lesson.id}-visualization-title`}>从一张大宽表，走到一颗星</h2>
                <p>先启动建模，再切换事实表粒度，最后亲眼看见粒度不一致为什么会让金额重复计算。</p>
              </>
            ) : content.visualization.kind === 'modeling-intro' ? (
              <>
                <span className="eyebrow">建模导入</span>
                <h2 id={`${lesson.id}-visualization-title`}>先从一行原始数据开始</h2>
                <p>先观察字段混在一起的订单记录，再用四步建模思路定义它的业务含义。</p>
              </>
            ) : content.visualization.kind === 'scd' ? (
              <>
                <span className="eyebrow">SCD Type 2 交互实验</span>
                <h2 id={`${lesson.id}-visualization-title`}>直接 UPDATE，历史去了哪里？</h2>
                <p>
                  先让错误方案产生历史冲突，再切换到 SCD Type 2，观察时间点查询如何命中正确版本。
                </p>
              </>
            ) : (
              <>
                <span className="eyebrow">动手实验</span>
                <h2 id={`${lesson.id}-visualization-title`}>把概念变成一条可观察的数据流</h2>
                <p>操作下面的图，观察数据如何进入系统、被加工，或沿着依赖关系产生影响。</p>
              </>
            )}
          </div>
          {content.visualization.kind === 'systems' && (
            <BusinessSystemFlow
              systems={content.visualization.systems}
              warehouseLabel={content.visualization.warehouseLabel}
              outputs={content.visualization.outputs}
            />
          )}
          {content.visualization.kind === 'pipeline' && (
            <PipelineFlow stages={content.visualization.stages} />
          )}
          {content.visualization.kind === 'lineage' && (
            <LineageGraph nodes={content.visualization.nodes} edges={content.visualization.edges} />
          )}
          {content.visualization.kind === 'modeling-intro' && (
            <ModelingIntro visualization={content.visualization} />
          )}
          {content.visualization.kind === 'star-schema' && (
            <StarSchemaFlow visualization={content.visualization} />
          )}
          {content.visualization.kind === 'scd' && (
            <SlowlyChangingDimension visualization={content.visualization} />
          )}
        </section>
      )}

      {content.comparison && <CompareCard comparison={content.comparison} />}
      {content.code && <CodeBlock {...content.code} />}

      <section className="lesson-insights" aria-label="工程提示与易错点">
        <InsightCard label="工程提示" title="把定义放回真实场景" tone="blue">
          {content.engineeringTip}
        </InsightCard>
        <InsightCard label="容易混淆" title="记住边界，不要背成口号" tone="amber">
          {content.pitfalls.join(' ')}
        </InsightCard>
      </section>
    </div>
  )
}
