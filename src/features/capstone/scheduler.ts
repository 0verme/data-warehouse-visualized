import {
  BANKING_SCHEDULER_TASK_IDS,
  bankingDepositBalanceTaskContract,
  createBankingSchedulerTasks,
} from '../scheduler/banking'
import type { SchedulerRunState, SchedulerTaskDefinition } from '../scheduler/types'
import {
  buildSchedulerTimeline,
  createInitialSchedulerRun,
  createPartitionRerunPlan,
} from '../../utils/scheduler'
import type { CapstoneSchedulerProjection } from './types'
import type { TransformationTaskContract } from '../sql-transformation/types'
import {
  CAPSTONE_BUSINESS_DATE,
  CAPSTONE_DELIVERY_SLA_AT,
  CAPSTONE_FINAL_GRAIN,
  CAPSTONE_FINAL_PRODUCT_TABLE,
  CAPSTONE_LOAN_ARRIVED_AT,
  CAPSTONE_LOAN_EXPECTED_AT,
  CAPSTONE_PROCESSING_STARTED_AT,
} from './constants'

function withContract(
  base: TransformationTaskContract,
  overrides: Partial<TransformationTaskContract>,
): TransformationTaskContract {
  return { ...base, ...overrides }
}

function getTask(
  tasks: readonly SchedulerTaskDefinition[],
  taskId: string,
): SchedulerTaskDefinition {
  const task = tasks.find((candidate) => candidate.taskId === taskId)
  if (!task) {
    throw new Error(`Capstone Scheduler 缺少任务: ${taskId}`)
  }
  return task
}

/** Add only the Capstone loan path to the existing banking Scheduler task model. */
export function createCapstoneSchedulerTasks(): SchedulerTaskDefinition[] {
  const bankingTasks = createBankingSchedulerTasks(bankingDepositBalanceTaskContract)
  const branchTask = getTask(bankingTasks, BANKING_SCHEDULER_TASK_IDS.branch)
  const depositAdsTask = getTask(bankingTasks, BANKING_SCHEDULER_TASK_IDS.ads)

  const loanInputTask: SchedulerTaskDefinition = {
    taskId: 'prepare.loan-balance-snapshot.daily.v1',
    label: 'LoanBalanceSnapshot 到达',
    layer: 'ods',
    description: '接收信贷系统提供的 loan_id × snapshot_date 日终贷款余额事实。',
    dependsOn: [],
    contract: withContract(bankingDepositBalanceTaskContract, {
      taskId: 'prepare.loan-balance-snapshot.daily.v1',
      inputTables: ['LoanBalanceSnapshot'],
      outputTable: 'ods_loan_balance_snapshot',
      outputGrain: 'loan_id × snapshot_date',
      dependencies: [],
      rerunHint: `按 business_date = ${CAPSTONE_BUSINESS_DATE} 覆盖贷款快照分区。`,
    }),
    durationMinutes: 3,
    maxAttempts: 1,
    slaMinutes: 330,
  }

  const loanDwdTask: SchedulerTaskDefinition = {
    taskId: 'transform.loan-balance.detail.daily.v1',
    label: 'DWD 贷款余额明细',
    layer: 'dwd',
    description: '保留信贷系统最小事实，按 loan_id × snapshot_date 对齐分行键。',
    dependsOn: [loanInputTask.taskId],
    contract: withContract(bankingDepositBalanceTaskContract, {
      taskId: 'transform.loan-balance.detail.daily.v1',
      inputTables: [loanInputTask.contract.outputTable],
      outputTable: 'dwd_loan_balance_detail',
      outputGrain: 'loan_id × snapshot_date',
      dependencies: [loanInputTask.taskId],
      rerunHint: `只重算 business_date = ${CAPSTONE_BUSINESS_DATE} 的贷款明细分区。`,
    }),
    durationMinutes: 4,
    maxAttempts: 2,
    slaMinutes: 330,
  }

  const loanDwsTask: SchedulerTaskDefinition = {
    taskId: 'transform.loan-balance.topic.daily.v1',
    label: 'DWS 贷款余额主题',
    layer: 'dws',
    description: '先按 business_date × branch_id 汇总贷款日终余额。',
    dependsOn: [loanDwdTask.taskId],
    contract: withContract(bankingDepositBalanceTaskContract, {
      taskId: 'transform.loan-balance.topic.daily.v1',
      inputTables: [loanDwdTask.contract.outputTable, 'Branch'],
      outputTable: 'dws_loan_balance_daily',
      outputGrain: CAPSTONE_FINAL_GRAIN,
      dependencies: [loanDwdTask.taskId, branchTask.taskId],
      rerunHint: `按 business_date = ${CAPSTONE_BUSINESS_DATE} 覆盖贷款主题分区。`,
    }),
    durationMinutes: 5,
    maxAttempts: 2,
    slaMinutes: 330,
  }

  const finalTask: SchedulerTaskDefinition = {
    taskId: 'publish.branch-business-daily.v1',
    label: '发布 branch_business_daily',
    layer: 'ads',
    description: '汇合存款主题和贷款主题，写入分行日经营指标快照。',
    dependsOn: [depositAdsTask.taskId, loanDwsTask.taskId, branchTask.taskId],
    contract: withContract(bankingDepositBalanceTaskContract, {
      taskId: 'publish.branch-business-daily.v1',
      inputTables: [
        depositAdsTask.contract.outputTable,
        loanDwsTask.contract.outputTable,
        'Branch',
      ],
      outputTable: CAPSTONE_FINAL_PRODUCT_TABLE,
      outputGrain: CAPSTONE_FINAL_GRAIN,
      dependencies: [depositAdsTask.taskId, loanDwsTask.taskId, branchTask.taskId],
      rerunHint: `按 business_date = ${CAPSTONE_BUSINESS_DATE} 覆盖 branch_business_daily 目标分区。`,
    }),
    durationMinutes: 4,
    maxAttempts: 2,
    slaMinutes: 330,
  }

  return [...bankingTasks, loanInputTask, loanDwdTask, loanDwsTask, finalTask]
}

export const capstoneSchedulerTasks = createCapstoneSchedulerTasks()

function buildSchedulerRun(
  tasks: readonly SchedulerTaskDefinition[],
  scenario: 'happy-path' | 'upstream-late',
): { terminal: SchedulerRunState; timeline: SchedulerRunState[] } {
  const initial = createInitialSchedulerRun(tasks, {
    businessDate: CAPSTONE_BUSINESS_DATE,
    scenario,
    scheduledAt: CAPSTONE_PROCESSING_STARTED_AT,
    maxConcurrentTasks: 8,
    lateDataAvailableAt: CAPSTONE_LOAN_ARRIVED_AT,
    lateDataDetectedAt: CAPSTONE_LOAN_ARRIVED_AT,
    lateDataTaskId: 'prepare.loan-balance-snapshot.daily.v1',
    runId: `run.capstone.branch-business.${scenario}`,
  })
  const timeline = buildSchedulerTimeline(initial)
  const terminal = timeline.at(-1)
  if (!terminal || (terminal.status !== 'success' && terminal.status !== 'failed')) {
    throw new Error(`Capstone Scheduler 未能到达终态: ${scenario}`)
  }
  return { terminal, timeline }
}

export function createCapstoneSchedulerProjection(): CapstoneSchedulerProjection {
  const happy = buildSchedulerRun(capstoneSchedulerTasks, 'happy-path')
  const late = buildSchedulerRun(capstoneSchedulerTasks, 'upstream-late')
  return {
    tasks: capstoneSchedulerTasks,
    happyRun: happy.terminal,
    lateRun: late.terminal,
    lateTimeline: late.timeline,
    loanExpectedAt: CAPSTONE_LOAN_EXPECTED_AT,
    processingStartedAt: CAPSTONE_PROCESSING_STARTED_AT,
    loanArrivedAt: CAPSTONE_LOAN_ARRIVED_AT,
    deliverySlaAt: CAPSTONE_DELIVERY_SLA_AT,
    loanRerunPlan: createPartitionRerunPlan(
      capstoneSchedulerTasks,
      CAPSTONE_BUSINESS_DATE,
      'partial',
      'prepare.loan-balance-snapshot.daily.v1',
    ),
    backfillPlan: createPartitionRerunPlan(
      capstoneSchedulerTasks,
      CAPSTONE_BUSINESS_DATE,
      'full',
      'publish.branch-business-daily.v1',
    ),
  }
}
