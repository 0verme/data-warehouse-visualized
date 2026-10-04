/**
 * SQL Sandbox（Issue #35 Stage 1）错误语义映射。
 *
 * 纯函数，不依赖 DuckDB / React：把 DuckDB 原始错误与守卫拦截翻译成
 * 「教学化短提示 + 可展开原文」所需的数据。真实结果永远来自 DuckDB，
 * 这里只负责解释错误，不参与结果生成。
 */
import { SQL_SANDBOX_SEED_COLUMNS } from './seed'

export type SqlSandboxFailureKind =
  | 'guard'
  | 'parse'
  | 'column'
  | 'table'
  | 'group-by'
  | 'permission'
  | 'timeout'
  | 'runtime'
  | 'unknown'

export interface SqlSandboxFailure {
  kind: SqlSandboxFailureKind
  /** 教学化标题，一句话说明发生了什么。 */
  title: string
  /** 可操作的下一步提示。 */
  hint: string
  /** DuckDB 原文；守卫拦截等本地错误为 null。 */
  raw: string | null
}

/** 查询超过该时长仍未返回时判定超时，并终止 worker。 */
export const SQL_SANDBOX_QUERY_TIMEOUT_MS = 10_000

/** 超时错误。用独立类型与 DuckDB 错误区分，便于映射与测试。 */
export class SqlSandboxTimeoutError extends Error {
  constructor() {
    super(`SQL 查询超过 ${SQL_SANDBOX_QUERY_TIMEOUT_MS / 1000} 秒未返回`)
    this.name = 'SqlSandboxTimeoutError'
  }
}

const AVAILABLE_COLUMNS = SQL_SANDBOX_SEED_COLUMNS.join('、')

const FEATURE_UNSUPPORTED_MESSAGE =
  '当前浏览器缺少 WebAssembly 或 Worker 支持，无法运行真实 SQL 实验。课程正文不受影响。'

/** 当前环境无法运行沙盒时的降级提示（不进入错误分类，固定文案）。 */
export function getUnsupportedEnvironmentFailure(): SqlSandboxFailure {
  return {
    kind: 'runtime',
    title: '当前环境无法运行真实 SQL 实验',
    hint: `${FEATURE_UNSUPPORTED_MESSAGE} 你仍然可以阅读主课程的确定性演示。`,
    raw: null,
  }
}

export function getGuardFailure(detail: string | undefined): SqlSandboxFailure {
  return {
    kind: 'guard',
    title: '只读实验限制',
    hint: detail ?? '实验只允许单条只读 SELECT / WITH 查询。',
    raw: null,
  }
}

function classifyRawMessage(raw: string): Exclude<SqlSandboxFailureKind, 'guard'> {
  if (/parser error/iu.test(raw)) {
    return 'parse'
  }

  if (/permission error/iu.test(raw)) {
    return 'permission'
  }

  if (/catalog error/iu.test(raw) && /table with name|does not exist/iu.test(raw)) {
    return 'table'
  }

  if (/binder error/iu.test(raw) && /group by/iu.test(raw)) {
    return 'group-by'
  }

  if (/binder error/iu.test(raw) && /referenced column|not found in from clause/iu.test(raw)) {
    return 'column'
  }

  return 'unknown'
}

const FAILURE_COPY: Record<
  Exclude<SqlSandboxFailureKind, 'guard'>,
  { title: string; hint: string }
> = {
  parse: {
    title: 'SQL 语法不完整',
    hint: '检查关键字拼写、括号和逗号。DuckDB 的 “at or near” 位置通常就是问题所在。',
  },
  column: {
    title: '字段不存在',
    hint: `实验表的可用字段：${AVAILABLE_COLUMNS}。`,
  },
  table: {
    title: '表不存在',
    hint: '进阶实验里只有一张表 dwd_deposit_balance_detail。',
  },
  'group-by': {
    title: '聚合字段与 GROUP BY 不一致',
    hint: '没有被聚合函数包住的字段必须出现在 GROUP BY 中；GROUP BY 的字段组合决定一行代表什么。',
  },
  permission: {
    title: '外部数据访问被禁用',
    hint: '实验使用浏览器本地内存数据库，不能读取文件、网络或挂载其它数据库。',
  },
  timeout: {
    title: '查询超时，实验环境已重置',
    hint: '请缩小查询范围或简化语句，然后重新运行；运行会自动重新启动实验环境。',
  },
  runtime: {
    title: '本地数据库无响应，实验环境已重置',
    hint: '点击「运行」会重新启动实验环境；也可以先点「重置实验环境」。',
  },
  unknown: {
    title: '查询失败',
    hint: '展开原始错误查看 DuckDB 的完整信息；修改 SQL 后可以继续运行。',
  },
}

export function mapSqlFailure(error: unknown): SqlSandboxFailure {
  if (error instanceof SqlSandboxTimeoutError) {
    const copy = FAILURE_COPY.timeout
    return { kind: 'timeout', ...copy, raw: error.message }
  }

  const raw = error instanceof Error ? error.message : String(error)
  const kind = classifyRawMessage(raw)
  const copy = FAILURE_COPY[kind]

  return { kind, ...copy, raw }
}
