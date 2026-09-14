export type CodeHighlightMap = Record<string, string>

export function getCodeHighlightKey(language: string, code: string) {
  return JSON.stringify([language, code])
}
