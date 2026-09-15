import type { Lesson } from '../../data/course'
import { getChapterDisplayNumber } from '../../utils/lesson'
import type { LessonContent } from '../types'
import {
  dataGovernanceContent,
  governanceChangeResponsibilityContent,
  governanceEvidenceContent,
  governanceFieldAccessContent,
  governanceLifecycleContent,
} from './data-governance'
import { dataQualityDatasetContent } from './data-quality-dataset'
import { dataQualityEvidenceContent } from './data-quality-evidence'
import { dataQualityReleaseContent } from './data-quality-release'
import { dataQualityRulesContent } from './data-quality-rules'
import { dataQualityContent } from './data-quality'
import { dataLineageContent } from './data-lineage'
import { dataModelingContent } from './data-modeling'
import { factTableTypesContent } from './fact-table-types'
import { grainContent } from './grain'
import { lakehouseContent } from './lakehouse'
import { metricSystemContent } from './metric-system'
import { depositMetricDefinitionContent } from './deposit-metric-definition'
import { depositMetricDerivationsContent } from './deposit-metric-derivations'
import { depositMetricTimeContent } from './deposit-metric-time'
import { performanceAndPracticeContent } from './performance-and-practice'
import { slowlyChangingDimensionContent } from './slowly-changing-dimension'
import { schedulingBusinessDateContent } from './scheduling-business-date'
import { schedulingFailureContent } from './scheduling-failure'
import { schedulingReadinessContent } from './scheduling-readiness'
import { schedulingRerunContent } from './scheduling-rerun'
import { schedulingSlaContent } from './scheduling-sla'
import { sqlAndTransformationContent } from './sql-and-transformation'
import { sqlTransformationCleaningContent } from './sql-and-transformation-cleaning'
import { sqlTransformationContractContent } from './sql-and-transformation-contract'
import { sqlTransformationJoinContent } from './sql-and-transformation-join'
import { sqlTransformationLayersContent } from './sql-and-transformation-layers'
import { starSchemaAndGrainContent } from './star-schema-and-grain'
import { warehouseLayersContent } from './warehouse-layers'
import { whyDataWarehouseContent } from './why-data-warehouse'

const lessonContentBySlug: Record<string, LessonContent> = {
  'data-governance': dataGovernanceContent,
  'data-governance-evidence': governanceEvidenceContent,
  'data-governance-field-access': governanceFieldAccessContent,
  'data-governance-lifecycle': governanceLifecycleContent,
  'data-governance-change-responsibility': governanceChangeResponsibilityContent,
  'data-quality': dataQualityContent,
  'data-quality-rules': dataQualityRulesContent,
  'data-quality-dataset': dataQualityDatasetContent,
  'data-quality-evidence': dataQualityEvidenceContent,
  'data-quality-release': dataQualityReleaseContent,
  'why-data-warehouse': whyDataWarehouseContent,
  'warehouse-layers': warehouseLayersContent,
  'data-lineage': dataLineageContent,
  'data-modeling': dataModelingContent,
  'fact-table-types': factTableTypesContent,
  grain: grainContent,
  'metric-system': metricSystemContent,
  'deposit-metric-definition': depositMetricDefinitionContent,
  'deposit-metric-time': depositMetricTimeContent,
  'deposit-metric-derivations': depositMetricDerivationsContent,
  'star-schema-and-grain': starSchemaAndGrainContent,
  'slowly-changing-dimension': slowlyChangingDimensionContent,
  lakehouse: lakehouseContent,
  'scheduling-system': schedulingBusinessDateContent,
  'scheduling-readiness': schedulingReadinessContent,
  'scheduling-failure': schedulingFailureContent,
  'scheduling-rerun': schedulingRerunContent,
  'scheduling-sla': schedulingSlaContent,
  'sql-and-transformation': sqlAndTransformationContent,
  'sql-transformation-cleaning': sqlTransformationCleaningContent,
  'sql-transformation-join': sqlTransformationJoinContent,
  'sql-transformation-layers': sqlTransformationLayersContent,
  'sql-transformation-contract': sqlTransformationContractContent,
  'performance-and-practice': performanceAndPracticeContent,
}

export function getLessonContent(lesson: Lesson): LessonContent {
  return (
    lessonContentBySlug[lesson.slug] ?? {
      eyebrow: `第 ${getChapterDisplayNumber(lesson.chapter)} 章 · 数据仓库实战`,
      subtitle: '把业务问题、数据粒度、指标口径和任务依赖串成一条可维护的仓库建设路线。',
      quickSummary: lesson.summary,
      concept: {
        term: lesson.title.replace(/[？：]/g, ''),
        definition: '一套可维护的数据仓库，需要同时处理业务口径、数据质量、任务运行和变更影响。',
      },
      sections: [
        {
          title: '搭建数据仓库前，问题要写清楚',
          paragraphs: [
            '把业务过程、数据粒度和指标口径写清楚，再安排加工、质量检查和调度责任。这样搭建出来的仓库，才有依据判断结果是否可信。',
          ],
          bullets: [
            '明确要服务的业务问题和使用者。',
            '为事实表、指标和分区写出粒度与时间语义。',
            '把质量、运行、权限和变更通知纳入交付清单。',
          ],
        },
      ],
      engineeringTip: '仓库建设需要同时记录业务口径、数据责任、质量校验、调度边界和变更影响。',
      pitfalls: ['不要在没有明确业务问题和验收口径前堆叠技术组件。'],
    }
  )
}
