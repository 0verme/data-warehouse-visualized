/**
 * Stage 0 的粗粒度执行守卫。
 *
 * 真正的安全边界是「内存实例 + enable_external_access=false + 无服务端」，
 * 这里只做教学实验级别的低成本拦截：单条语句、只读开头、长度上限、
 * 禁止明显的 DDL / DML / 文件访问动词。
 */

export const SQL_SANDBOX_MAX_SQL_LENGTH = 4000

export interface SqlGuardRejection {
  ok: false
  reason: string
  detail?: string
}

export interface SqlGuardAcceptance {
  ok: true
  normalizedSql: string
}

export type SqlGuardResult = SqlGuardAcceptance | SqlGuardRejection

const FORBIDDEN_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'merge',
  'create',
  'drop',
  'alter',
  'truncate',
  'attach',
  'detach',
  'install',
  'load',
  'copy',
  'export',
  'import',
  'pragma',
  'set',
  'call',
  'vacuum',
  'checkpoint',
  'begin',
  'commit',
  'rollback',
] as const

const FIRST_KEYWORD = /^(select|with)\b/iu

/**
 * 把注释和字符串字面量替换成空格，避免用它们绕过关键字 / 分号检查。
 */
export function maskSqlLiteralsAndComments(sql: string): string {
  let result = ''
  let index = 0

  while (index < sql.length) {
    const char = sql[index]!
    const next = sql[index + 1]

    if (char === '-' && next === '-') {
      while (index < sql.length && sql[index] !== '\n') {
        result += ' '
        index += 1
      }
      continue
    }

    if (char === '/' && next === '*') {
      result += '  '
      index += 2
      while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) {
        result += sql[index] === '\n' ? '\n' : ' '
        index += 1
      }
      if (index < sql.length) {
        result += '  '
        index += 2
      }
      continue
    }

    if (char === "'" || char === '"') {
      const quote = char
      result += ' '
      index += 1
      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            result += '  '
            index += 2
            continue
          }
          result += ' '
          index += 1
          break
        }
        result += sql[index] === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }

    result += char
    index += 1
  }

  return result
}

export function guardSql(sql: string): SqlGuardResult {
  const normalizedSql = sql.trim()

  if (normalizedSql.length === 0) {
    return { ok: false, reason: 'empty', detail: 'SQL 不能为空' }
  }

  if (normalizedSql.length > SQL_SANDBOX_MAX_SQL_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      detail: `SQL 超过 ${SQL_SANDBOX_MAX_SQL_LENGTH} 字符上限`,
    }
  }

  const masked = maskSqlLiteralsAndComments(normalizedSql).trim()

  if (!FIRST_KEYWORD.test(masked)) {
    return {
      ok: false,
      reason: 'not-select',
      detail: '实验只允许以 SELECT 或 WITH 开头的只读查询',
    }
  }

  const withoutTrailingSemicolon = masked.replace(/;+\s*$/u, '')
  if (withoutTrailingSemicolon.includes(';')) {
    return {
      ok: false,
      reason: 'multiple-statements',
      detail: '实验只允许单条语句，请删除中间的分号',
    }
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`, 'iu').test(withoutTrailingSemicolon)) {
      return {
        ok: false,
        reason: 'forbidden-keyword',
        detail: `实验只允许只读查询，检测到禁止的语句动词：${keyword.toUpperCase()}`,
      }
    }
  }

  return { ok: true, normalizedSql }
}
