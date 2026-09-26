import type {
  ObjectLifecycleAction,
  ObjectLifecycleEvent,
  ObjectLifecycleObservation,
  ObjectLifecycleSelection,
  ObjectLifecycleSnapshot,
  ObjectLifecycleStrategy,
} from './types'

export const OBJECT_LIFECYCLE_STRATEGIES: readonly {
  readonly id: ObjectLifecycleStrategy
  readonly label: string
  readonly title: string
  readonly sql: string
  readonly summary: string
}[] = [
  {
    id: 'drop-ctas',
    label: 'Strategy A',
    title: 'DROP + CTAS',
    sql: `DROP TABLE ads_deposit_balance_daily;\nCREATE TABLE ads_deposit_balance_daily AS\nSELECT snapshot_date, branch_name, balance\nFROM dws_deposit_balance_daily;`,
    summary: '删除旧对象，再从查询结果创建新对象。',
  },
  {
    id: 'fixed-table',
    label: 'Strategy B',
    title: '固定表 + TRUNCATE / INSERT',
    sql: `TRUNCATE TABLE ads_deposit_balance_daily;\nINSERT INTO ads_deposit_balance_daily\nSELECT snapshot_date, branch_name, balance\nFROM dws_deposit_balance_daily;`,
    summary: '保留声明好的目标对象，替换其中的数据。',
  },
]

export const OBJECT_LIFECYCLE_EVENTS: readonly {
  readonly id: ObjectLifecycleEvent
  readonly label: string
  readonly detail: string
}[] = [
  { id: 'success', label: '正常成功', detail: '刷新与校验都完成。' },
  {
    id: 'after-create-failure',
    label: '创建 / 写入后失败',
    detail: '结果已写出，但后续校验失败；不能直接视为可发布。',
  },
  {
    id: 'insert-failure',
    label: '写入中失败',
    detail: '旧数据清理步骤已完成，结果写入未完成。',
  },
  {
    id: 'schema-change',
    label: 'Schema 变化',
    detail: '查询结果新增 account_count，原目标契约仍是旧结构。',
  },
  { id: 'retry', label: '失败后 Retry', detail: '第一次中断，第二次完整刷新成功。' },
]

interface ObjectLifecycleScenario {
  readonly runStatus: string
  readonly tone: ObjectLifecycleSnapshot['tone']
  readonly targetExists: boolean
  readonly objectIdentity: string
  readonly visibleData: string
  readonly schema: string
  readonly identityDetail: string
  readonly schemaDetail: string
  readonly operations: ObjectLifecycleSnapshot['operations']
  readonly recovery: ObjectLifecycleObservation
  readonly conclusion: string
  readonly transactionNote: string
}

const STRATEGY_OBSERVATIONS: Record<
  ObjectLifecycleStrategy,
  readonly ObjectLifecycleObservation[]
> = {
  'drop-ctas': [
    {
      label: 'Metadata',
      value: '需重新核对',
      detail: '新建对象的注释、约束、索引、属性和统计信息是否重建，取决于建表脚本和数据库实现。',
    },
    {
      label: '权限',
      value: '重新验证授权',
      detail: 'DROP + CREATE 所需权限、owner 和 grants 的恢复方式，应在生产发布中显式确认。',
    },
    {
      label: 'Dependency',
      value: '重新验证引用',
      detail:
        '依赖对象可能阻止 DROP、需要显式处理，或在重建后需要重新绑定；RESTRICT / CASCADE 等细节因实现而异。',
    },
    {
      label: 'Lineage / observability',
      value: '关注对象代次',
      detail:
        '目录工具可能记录新对象代次或替换事件；运行、影响范围和历史 lineage 的呈现取决于观测系统。',
    },
    {
      label: '并发读者 / jobs',
      value: '存在替换窗口',
      detail:
        'DROP 与 CREATE 之间可能有对象不可用窗口；并发刷新还可能互相覆盖。事务、锁和原子替换能力因实现而异。',
    },
  ],
  'fixed-table': [
    {
      label: 'Metadata',
      value: '对象定义保持',
      detail:
        '本模型没有 DROP 表，声明的列、约束、注释与表级属性仍属于同一对象；统计信息可能随写入更新。',
    },
    {
      label: '权限',
      value: '检查 TRUNCATE / INSERT 权限',
      detail: '授权仍关联固定目标，但 TRUNCATE、INSERT 与所有权要求因数据库实现和安全策略而异。',
    },
    {
      label: 'Dependency',
      value: '引用身份稳定',
      detail: '下游仍指向同一目标对象，但数据含义或 schema 改变仍可能破坏消费者契约。',
    },
    {
      label: 'Lineage / observability',
      value: '同一目标，多次写入',
      detail:
        '适合按 run 记录每次写入与质量证据；自动 lineage 能否区分数据版本由目录和观测工具决定。',
    },
    {
      label: '并发读者 / jobs',
      value: '需保护刷新窗口',
      detail:
        'TRUNCATE 与 INSERT 之间读者可能看到空结果或旧/新快照；并发写入可能冲突。是否原子可见取决于事务和发布方式。',
    },
  ],
}

const SCENARIOS: Record<
  ObjectLifecycleStrategy,
  Record<ObjectLifecycleEvent, ObjectLifecycleScenario>
> = {
  'drop-ctas': {
    success: {
      runStatus: 'SUCCESS',
      tone: 'success',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 新对象代次 #02',
      visibleData: '完整的新结果已写出；仍需通过发布校验。',
      schema: '从 SELECT 结果推导为 Schema v1。',
      identityDetail: '名字相同，不代表逻辑对象代次相同。',
      schemaDetail: '列和类型随查询结果变化；具体推导规则因数据库而异。',
      operations: [
        { title: 'DROP 旧目标', detail: '旧对象代次 #01 被移除。', state: 'done' },
        {
          title: 'CREATE TABLE AS SELECT',
          detail: '创建新对象代次 #02，并写入完整结果。',
          state: 'done',
        },
        { title: '校验并发布', detail: '结果通过教学案例中的发布检查。', state: 'done' },
      ],
      recovery: {
        label: 'Retry / recovery',
        value: '可再建，但需补齐对象契约',
        detail: '确认对象、授权、依赖和校验都已恢复，不能只检查 Job SUCCESS。',
      },
      conclusion: '成功时两种策略都可以得到正确数据；差别在对象是否被替换及需要恢复的契约。',
      transactionNote: '读者能否原子看到结果取决于数据库和发布实现。',
    },
    'after-create-failure': {
      runStatus: 'FAILED · 后续校验',
      tone: 'danger',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 新对象代次 #02',
      visibleData: '新结果已写出但未通过校验；是否已对读者可见取决于发布门禁。',
      schema: '新建对象已采用本次查询推导的 Schema v1。',
      identityDetail: '失败发生在创建和写入之后。',
      schemaDetail: 'schema 可以变化，消费者契约仍需单独验证。',
      operations: [
        { title: 'DROP 旧目标', detail: '旧对象代次 #01 被移除。', state: 'done' },
        { title: 'CTAS 创建新对象', detail: '新代次 #02 和结果已写出。', state: 'done' },
        {
          title: '后续质量 / 发布校验',
          detail: '校验失败；不能把对象存在等同于结果已发布。',
          state: 'failed',
        },
      ],
      recovery: {
        label: 'Retry / recovery',
        value: '先隔离未验收结果',
        detail: '判断读者是否已接触新结果，再修复校验并重跑或回退到保留的版本。',
      },
      conclusion: 'Job 失败时对象可能已经存在；对象存在不等于数据已被批准消费。',
      transactionNote: '此处故障点在 CTAS 成功后的校验步骤；数据库不负责替代业务发布门禁。',
    },
    'insert-failure': {
      runStatus: 'FAILED · CTAS',
      tone: 'danger',
      targetExists: false,
      objectIdentity: '目标名暂时没有对象',
      visibleData: '通过该目标名无法读取旧结果；恢复前消费者可能查询失败。',
      schema: '新对象未形成。',
      identityDetail: '旧代次已移除，新代次创建失败。',
      schemaDetail: '需先使 CTAS 成功，才能检查结果形状。',
      operations: [
        { title: 'DROP 旧目标', detail: '本案例假设 DROP 已提交。', state: 'done' },
        {
          title: 'CREATE TABLE AS SELECT',
          detail: '查询执行失败；本模型不保留旧目标。',
          state: 'failed',
        },
        { title: '恢复对象', detail: '需要重新创建并重验对象契约。', state: 'pending' },
      ],
      recovery: {
        label: 'Retry / recovery',
        value: '先恢复同名目标',
        detail: '确认建表定义、权限、依赖及消费者可用性，再重跑并做数据校验。',
      },
      conclusion: '在本模型的提交边界下，DROP 已提交而 CTAS 失败会留下对象缺口。',
      transactionNote:
        '演示假设 DROP 与 CTAS 不在同一个可回滚事务中。若数据库把 DDL 包在事务里，失败后的状态可能不同。',
    },
    'schema-change': {
      runStatus: 'SUCCESS · Schema v2',
      tone: 'caution',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 新对象代次 #02',
      visibleData: '包含 account_count 的新结果已写出；旧消费者需复核。',
      schema: '从 SELECT 推导为 Schema v2（新增 account_count）。',
      identityDetail: '对象代次变化，即便名字不变。',
      schemaDetail: '查询结果形状变化成为新对象结构。',
      operations: [
        { title: 'DROP 旧目标', detail: '旧对象代次 #01 被移除。', state: 'done' },
        {
          title: 'CTAS 输出新 schema',
          detail: '查询结果新增 account_count，新对象按结果推导结构。',
          state: 'done',
        },
        { title: '检查下游契约', detail: '需验证依赖视图、权限和消费者兼容性。', state: 'pending' },
      ],
      recovery: {
        label: 'Retry / recovery',
        value: '修订消费者或回退版本',
        detail: '若新 schema 不兼容，需回退或同步迁移下游契约。',
      },
      conclusion: 'CTAS 更容易让新查询形状落成新 schema；但下游兼容性仍需管理。',
      transactionNote: '列类型推导、约束和表属性如何创建均由数据库实现决定。',
    },
    retry: {
      runStatus: 'RETRY SUCCESS · Attempt 2',
      tone: 'success',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 新对象代次 #03',
      visibleData: 'Attempt 2 的完整结果可用；需核对消费者看到的代次。',
      schema: 'Attempt 2 再次从查询结果推导。',
      identityDetail: '#01 → 缺失 → #03；同名对象经历两次代次变化。',
      schemaDetail: '输入或查询变更仍可能改变结果结构。',
      operations: [
        { title: 'Attempt 1', detail: '在旧代次被移除后失败。', state: 'failed' },
        { title: 'Retry：重新 DROP + CTAS', detail: '再次创建对象代次 #03。', state: 'done' },
        { title: '校验并发布', detail: '第二次执行成功，仍需发布检查。', state: 'done' },
      ],
      recovery: {
        label: 'Retry / recovery',
        value: 'Retry 可成功，不代表副作用消失',
        detail: '回看第一次失败期间的读者错误、权限恢复和重复 lineage 记录。',
      },
      conclusion: 'Retry 可以恢复最终数据，但曾经发生的对象缺口和副作用仍要审计。',
      transactionNote: '重试的对象代次和可见性依赖每次 DDL 的提交及隔离行为。',
    },
  },
  'fixed-table': {
    success: {
      runStatus: 'SUCCESS',
      tone: 'success',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 固定对象 #01',
      visibleData: 'TRUNCATE + INSERT 完成；完整的新结果可用。',
      schema: '维持预先声明的 Schema v1。',
      identityDetail: '同名、同一声明对象，写入数据替换。',
      schemaDetail: '目标定义稳定；输出不兼容变化需显式处理。',
      operations: [
        { title: 'TRUNCATE 固定目标', detail: '清理目标数据，对象定义保留。', state: 'done' },
        { title: 'INSERT 查询结果', detail: '向同一对象 #01 写入完整结果。', state: 'done' },
        { title: '校验并发布', detail: '结果通过教学案例中的发布检查。', state: 'done' },
      ],
      recovery: {
        label: 'Retry / recovery',
        value: '按完整目标范围重新装载',
        detail: '确定业务日期和替换范围；固定表本身不自动保证幂等。',
      },
      conclusion: '成功时两种策略都可以得到正确数据；固定表保持声明对象与 schema 契约。',
      transactionNote: '读者能否原子看到结果取决于数据库和发布实现。',
    },
    'after-create-failure': {
      runStatus: 'FAILED · 后续校验',
      tone: 'danger',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 固定对象 #01',
      visibleData: '新结果已写出但未通过校验；是否已对读者可见取决于事务 / 发布门禁。',
      schema: '固定对象仍使用 Schema v1。',
      identityDetail: '表定义未被替换。',
      schemaDetail: '输出列需满足已声明的目标契约。',
      operations: [
        { title: 'TRUNCATE 固定目标', detail: '原有行已清理。', state: 'done' },
        { title: 'INSERT 查询结果', detail: '新行已写入固定对象 #01。', state: 'done' },
        {
          title: '后续质量 / 发布校验',
          detail: '校验失败；同一对象存在不代表数据可发布。',
          state: 'failed',
        },
      ],
      recovery: {
        label: 'Retry / recovery',
        value: '保护未验收的新数据',
        detail: '修复失败原因后按同一目标范围重装；若读者已看到结果，应追加告警或补偿。',
      },
      conclusion: '对象 identity 稳定，但校验失败后的数据状态仍须治理，不能把“表还在”当成安全。',
      transactionNote: '表对象未 DROP；写入事务能否回滚或隔离读者，仍取决于数据库实现。',
    },
    'insert-failure': {
      runStatus: 'FAILED · INSERT',
      tone: 'danger',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 固定对象 #01',
      visibleData: '本案例假设 TRUNCATE 已提交；目标仍存在，但当前没有完整新结果。',
      schema: '固定对象定义保留为 Schema v1。',
      identityDetail: '表对象存在，行数据未完成刷新。',
      schemaDetail: '行数据失败不自动改变对象定义。',
      operations: [
        { title: 'TRUNCATE 固定目标', detail: '本案例假设清空步骤已提交。', state: 'done' },
        {
          title: 'INSERT 查询结果',
          detail: '写入失败；本案例按语句失败处理，不呈现完整新结果。',
          state: 'failed',
        },
        { title: '恢复完整数据', detail: '修复后重新装载或按事务策略回滚。', state: 'pending' },
      ],
      recovery: {
        label: 'Retry / recovery',
        value: '重新装载完整范围',
        detail: '检查 TRUNCATE 是否可回滚、是否有备份/暂存副本，再决定重试或恢复旧数据。',
      },
      conclusion: '在本模型的提交边界下，INSERT 失败留下“对象存在、完整新数据不可用”。',
      transactionNote:
        '这里假设 TRUNCATE 已提交而 INSERT 失败。若由同一事务包裹且支持回滚，数据库可能恢复旧数据；部分写入可见性也依实现而异。',
    },
    'schema-change': {
      runStatus: 'BLOCKED · Schema mismatch',
      tone: 'caution',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 固定对象 #01',
      visibleData: '未形成可验收的新结果；旧数据是否仍可见取决于清空与事务边界。',
      schema: '目标仍为 Schema v1；需先计划迁移到 Schema v2。',
      identityDetail: '固定对象没有因为查询变化而自动重建。',
      schemaDetail: '须兼容映射或显式迁移，避免静默改变消费者契约。',
      operations: [
        { title: 'TRUNCATE 固定目标', detail: '案例模型已进入替换写入路径。', state: 'done' },
        {
          title: 'INSERT 新查询结构',
          detail: '新增 account_count 与目标契约不匹配，写入被阻止。',
          state: 'failed',
        },
        {
          title: '显式 Schema migration',
          detail: '评估兼容性、消费者和回滚后再变更。',
          state: 'pending',
        },
      ],
      recovery: {
        label: 'Retry / recovery',
        value: '先迁移，再重跑',
        detail: '确认目标定义和消费者兼容后再执行；不要盲目反复重试同一结构错误。',
      },
      conclusion: '固定 schema 让兼容性问题显式化，但也需要承担迁移与版本协调。',
      transactionNote: '错误被检测在写入阶段；清空是否已对外可见仍取决具体执行与事务边界。',
    },
    retry: {
      runStatus: 'RETRY SUCCESS · Attempt 2',
      tone: 'success',
      targetExists: true,
      objectIdentity: 'ads_deposit_balance_daily · 固定对象 #01',
      visibleData: 'Attempt 2 完成完整刷新；数据通过校验。',
      schema: '仍为固定 Schema v1。',
      identityDetail: 'Retry 再次写入同一声明对象。',
      schemaDetail: '结构变化仍需要单独迁移。',
      operations: [
        { title: 'Attempt 1', detail: 'TRUNCATE 后写入未完成。', state: 'failed' },
        { title: 'Retry：再次 TRUNCATE + INSERT', detail: '对象 #01 保持不变。', state: 'done' },
        { title: '校验并发布', detail: '第二次执行得到完整结果。', state: 'done' },
      ],
      recovery: {
        label: 'Retry / recovery',
        value: '全范围重装后通过',
        detail: '只有写入范围完整、输入确定且并发受控时，Retry 才可收敛到预期结果。',
      },
      conclusion: '对象稳定不等于结果自动幂等；重试依然需要明确范围、事务和并发策略。',
      transactionNote: 'Retry 前后都应按数据库事务语义确认读者可见结果与回滚能力。',
    },
  },
}

export function createInitialObjectLifecycleSelection(): ObjectLifecycleSelection {
  return { strategy: 'drop-ctas', event: 'success' }
}

export function reduceObjectLifecycleSelection(
  state: ObjectLifecycleSelection,
  action: ObjectLifecycleAction,
): ObjectLifecycleSelection {
  switch (action.type) {
    case 'select-strategy':
      return state.strategy === action.strategy ? state : { ...state, strategy: action.strategy }
    case 'select-event':
      return state.event === action.event ? state : { ...state, event: action.event }
    case 'reset':
      return createInitialObjectLifecycleSelection()
  }
}

export function getObjectLifecycleSnapshot(
  strategy: ObjectLifecycleStrategy,
  event: ObjectLifecycleEvent,
): ObjectLifecycleSnapshot {
  const scenario = SCENARIOS[strategy][event]
  const { identityDetail, schemaDetail, recovery, ...snapshot } = scenario

  return {
    strategy,
    event,
    ...snapshot,
    observations: [
      { label: '对象 identity', value: snapshot.objectIdentity, detail: identityDetail },
      { label: 'Schema stability', value: snapshot.schema, detail: schemaDetail },
      ...STRATEGY_OBSERVATIONS[strategy],
      recovery,
    ],
  }
}
