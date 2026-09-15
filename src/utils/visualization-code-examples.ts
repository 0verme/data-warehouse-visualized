import type { LessonVisualization } from '../content/types'
import type { CodeHighlightExample } from './code-highlight'
import { TRANSFORMATION_STEPS } from './sql-transformation'

type CodeExampleProvider = (visualization: LessonVisualization) => readonly CodeHighlightExample[]

const visualizationCodeExampleProviders: Partial<
  Record<LessonVisualization['kind'], CodeExampleProvider>
> = {
  'sql-transformation': () =>
    TRANSFORMATION_STEPS.map((step) => ({
      language: 'sql',
      code: step.sql,
    })),
}

export function getVisualizationCodeExamples(
  visualization: LessonVisualization,
): readonly CodeHighlightExample[] {
  return visualizationCodeExampleProviders[visualization.kind]?.(visualization) ?? []
}
