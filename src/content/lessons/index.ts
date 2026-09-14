import type { Lesson } from '../../data/course'
import { getChapterDisplayNumber } from '../../utils/lesson'
import type { LessonContent } from '../types'
import { dataLineageContent } from './data-lineage'
import { dataModelingContent } from './data-modeling'
import { lakehouseContent } from './lakehouse'
import { metricSystemContent } from './metric-system'
import { performanceAndPracticeContent } from './performance-and-practice'
import { slowlyChangingDimensionContent } from './slowly-changing-dimension'
import { sqlAndTransformationContent } from './sql-and-transformation'
import { starSchemaAndGrainContent } from './star-schema-and-grain'
import { warehouseLayersContent } from './warehouse-layers'
import { whyDataWarehouseContent } from './why-data-warehouse'

const lessonContentBySlug: Record<string, LessonContent> = {
  'why-data-warehouse': whyDataWarehouseContent,
  'warehouse-layers': warehouseLayersContent,
  'data-lineage': dataLineageContent,
  'data-modeling': dataModelingContent,
  'metric-system': metricSystemContent,
  'star-schema-and-grain': starSchemaAndGrainContent,
  'slowly-changing-dimension': slowlyChangingDimensionContent,
  lakehouse: lakehouseContent,
  'sql-and-transformation': sqlAndTransformationContent,
  'performance-and-practice': performanceAndPracticeContent,
}

export function getLessonContent(lesson: Lesson): LessonContent {
  return (
    lessonContentBySlug[lesson.slug] ?? {
      eyebrow: `第 ${getChapterDisplayNumber(lesson.chapter)} 章 · 课程骨架`,
      subtitle: '这节课正在准备中，先把它放进完整的学习路线。',
      quickSummary: lesson.summary,
      concept: {
        term: lesson.title.replace(/[？：]/g, ''),
        definition: '后续将用图解、实验和工程案例，把这个主题拆成可以观察的学习步骤。',
      },
      sections: [
        {
          title: '这节课会学什么？',
          paragraphs: [lesson.summary],
          bullets: [
            '先建立概念的整体地图',
            '再用一个可操作的实验观察变化',
            '最后连接到真实工程中的取舍',
          ],
        },
      ],
      engineeringTip: 'MVP 先保留课程入口与学习进度；该课的交互实验将在后续阶段补充。',
      pitfalls: ['当前页面是课程骨架，不代表该主题已经完整实现。'],
    }
  )
}
