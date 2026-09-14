import { createHighlighter } from 'shiki'
import { bundledLanguages, type BundledLanguage } from 'shiki/langs'
import { getLessonContent } from '../content/lessons'
import type { Lesson } from '../data/course'
import type { LessonContent } from '../content/types'
import { getCodeHighlightKey, type CodeHighlightMap } from './code-highlight'

const SHIKI_THEME = 'nord' as const
const LANGUAGE_ALIASES = {
  bash: 'shellscript',
  js: 'javascript',
  md: 'markdown',
  sh: 'shellscript',
  shell: 'shellscript',
  ts: 'typescript',
  yml: 'yaml',
}

interface CodeExample {
  language: string
  code: string
}

type ShikiLanguage = BundledLanguage | 'plaintext'

function getShikiLanguage(language: string): ShikiLanguage {
  const normalizedLanguage = language.trim().toLowerCase()
  const resolvedLanguage =
    LANGUAGE_ALIASES[normalizedLanguage as keyof typeof LANGUAGE_ALIASES] ?? normalizedLanguage

  return Object.prototype.hasOwnProperty.call(bundledLanguages, resolvedLanguage)
    ? (resolvedLanguage as BundledLanguage)
    : 'plaintext'
}

function getCodeExamples(content: LessonContent): CodeExample[] {
  const examples: CodeExample[] = []

  if (content.code) {
    examples.push(content.code)
  }

  for (const section of content.sections) {
    if (section.kind === 'sql') {
      examples.push(section)
    }
  }

  return examples
}

export async function buildLessonCodeHighlightMap(
  lessons: readonly Lesson[],
): Promise<CodeHighlightMap> {
  const examples = lessons.flatMap((lesson) => getCodeExamples(getLessonContent(lesson)))
  const uniqueExamples = new Map<string, CodeExample>()

  for (const example of examples) {
    uniqueExamples.set(getCodeHighlightKey(example.language, example.code), example)
  }

  const languages = [
    'plaintext' as ShikiLanguage,
    ...new Set([...uniqueExamples.values()].map((example) => getShikiLanguage(example.language))),
  ]
  const highlighter = await createHighlighter({ langs: languages, themes: [SHIKI_THEME] })
  const highlights: CodeHighlightMap = {}

  for (const [key, example] of uniqueExamples) {
    highlights[key] = highlighter.codeToHtml(example.code, {
      lang: getShikiLanguage(example.language),
      theme: SHIKI_THEME,
    })
  }

  return highlights
}
