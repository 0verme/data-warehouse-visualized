/**
 * Stage 0 中唯一静态 import `@duckdb/duckdb-wasm` 的模块。
 *
 * 任何其他模块只允许 `import type`；这个模块必须保持只被动态 import，
 * 否则普通课程会重新出现 DuckDB chunk。`scripts/check-duckdb-isolation.mjs`
 * 会在构建产物上检查这一点。
 */
import {
  AsyncDuckDB,
  ConsoleLogger,
  DuckDBAccessMode,
  PACKAGE_VERSION,
  VoidLogger,
  createWorker,
  getJsDelivrBundles,
  getPlatformFeatures,
  selectBundle,
  type AsyncDuckDBConnection,
  type DuckDBBundle,
  type DuckDBBundles,
} from '@duckdb/duckdb-wasm'
import { arrowTableToResult, type ArrowTableLike } from './result'
import type { SelfHostAssetUrls, SqlQueryResult, SqlSandboxStrategy } from './types'

export interface CreateRuntimeOptions {
  strategy: SqlSandboxStrategy
  selfHost?: SelfHostAssetUrls
  /** 打开 DuckDB ConsoleLogger，仅用于本地调试。 */
  verbose?: boolean
}

export interface SqlSandboxRuntimeHandle {
  db: AsyncDuckDB
  connection: AsyncDuckDBConnection
  strategy: SqlSandboxStrategy
  selectedBundle: 'eh' | 'mvp' | 'coi'
  packageVersion: string
  engineVersion: string
}

/** 结束 busy worker 前等待优雅关闭的上限；空闲路径通常立即完成。 */
export const TERMINATE_GRACE_MS = 250

function buildBundles(strategy: SqlSandboxStrategy, selfHost?: SelfHostAssetUrls): DuckDBBundles {
  if (strategy === 'cdn') {
    return getJsDelivrBundles()
  }

  if (!selfHost) {
    throw new Error('self-host 策略需要在 URL 上提供自托管 worker / wasm 地址')
  }

  return {
    mvp: {
      mainModule: selfHost.mvpWasm ?? '',
      mainWorker: selfHost.mvpWorker ?? '',
    },
    eh: {
      mainModule: selfHost.ehWasm,
      mainWorker: selfHost.ehWorker,
    },
  }
}

function describeBundle(bundle: DuckDBBundle, bundles: DuckDBBundles): 'eh' | 'mvp' | 'coi' {
  if (bundle.pthreadWorker) {
    return 'coi'
  }
  if (bundles.eh && bundle.mainModule === bundles.eh.mainModule) {
    return 'eh'
  }
  return 'mvp'
}

export async function createRuntime(
  options: CreateRuntimeOptions,
): Promise<SqlSandboxRuntimeHandle> {
  const bundles = buildBundles(options.strategy, options.selfHost)
  const features = await getPlatformFeatures()

  if (!features.wasmExceptions && !(bundles.mvp.mainModule && bundles.mvp.mainWorker)) {
    throw new Error('当前浏览器不支持 WebAssembly exception handling，且自托管 mvp bundle 不可用')
  }

  const selected = await selectBundle(bundles)
  if (!selected.mainWorker) {
    throw new Error('DuckDB bundle 没有可用的 worker 入口')
  }

  const worker = await createWorker(selected.mainWorker)
  const logger = options.verbose ? new ConsoleLogger() : new VoidLogger()
  const db = new AsyncDuckDB(logger, worker)

  await db.instantiate(selected.mainModule, selected.pthreadWorker)
  await db.open({ path: ':memory:', accessMode: DuckDBAccessMode.READ_WRITE })

  const connection = await db.connect()
  const engineVersion = await db.getVersion()

  return {
    db,
    connection,
    strategy: options.strategy,
    selectedBundle: describeBundle(selected, bundles),
    packageVersion: PACKAGE_VERSION,
    engineVersion,
  }
}

/**
 * 建立内存实例后写入 seed，并关闭外部访问与配置修改。
 * 顺序有意固定：先建表 / 写数据，再锁配置。
 */
export async function seedRuntime(
  handle: SqlSandboxRuntimeHandle,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await handle.connection.query(statement)
  }

  await handle.connection.query('SET enable_external_access=false')
  await handle.connection.query('SET lock_configuration=true')
}

export async function runRuntimeQuery(
  handle: SqlSandboxRuntimeHandle,
  sql: string,
): Promise<SqlQueryResult> {
  const table = await handle.connection.query(sql)
  return arrowTableToResult(table as unknown as ArrowTableLike)
}

/**
 * 终止实验实例。
 *
 * 查询正在执行时 worker 不会处理 DISCONNECT 消息，`connection.close()` 会无限
 * 等待。因此先限时等待优雅关闭（正常空闲路径下立即返回），然后直接 hard
 * terminate worker；宁可重建实例，也不留下失控查询或挂起的关闭流程。
 */
export async function terminateRuntime(handle: SqlSandboxRuntimeHandle): Promise<void> {
  try {
    await Promise.race([
      handle.connection.close(),
      new Promise((resolve) => setTimeout(resolve, TERMINATE_GRACE_MS)),
    ])
  } catch {
    // 关闭失败无关紧要；下面的 terminate 才是真正的回收动作。
  }

  await handle.db.terminate()
}
