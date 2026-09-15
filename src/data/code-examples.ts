import type { CodeHighlightExample } from '../utils/code-highlight'

export const HERO_METRIC_SQL = `SELECT SUM(amount)
FROM dwd_order;`

export const HERO_METRIC_SQL_EXAMPLE: CodeHighlightExample = {
  language: 'sql',
  code: HERO_METRIC_SQL,
}
