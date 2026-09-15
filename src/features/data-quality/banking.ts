import type { QualityEvent } from './types'
import {
  BANKING_DEPOSIT_BALANCE_DATE,
  BANKING_SCHEDULER_SCHEDULED_AT,
  BANKING_SCHEDULER_TASK_IDS,
  bankingSchedulerVisualization,
} from '../scheduler/banking'
import { buildSchedulerTimeline, createInitialSchedulerRun } from '../../utils/scheduler'

const BALANCE_RECONCILIATION_RULE_ID = 'dwd_dws_balance_reconciliation'
const DWD_BALANCE = 1_000_000_000
const DWS_BALANCE = 800_000_000
const RECONCILIATION_DELTA = DWS_BALANCE - DWD_BALANCE

function getCompletedBankingRun() {
  const initialRun = createInitialSchedulerRun(bankingSchedulerVisualization.tasks, {
    businessDate: BANKING_DEPOSIT_BALANCE_DATE,
    scheduledAt: BANKING_SCHEDULER_SCHEDULED_AT,
    runId: 'run.deposit.balance.20260930.quality-001',
  })
  const completedRun = buildSchedulerTimeline(initialRun).at(-1)

  if (!completedRun || completedRun.status !== 'success') {
    throw new Error('第 07 章的存款余额 Quality Event 需要一轮成功的 Scheduler Run')
  }

  return completedRun
}

/**
 * 第 07 章交给血缘调查的最小真实事件。
 * 这里保留质量事件的领域结构；第 08 章只消费它，不重新定义质量规则。
 */
export function createDepositBalanceQualityEvent(): QualityEvent {
  const schedulerRun = getCompletedBankingRun()
  const dwsTask = bankingSchedulerVisualization.tasks.find(
    (task) => task.taskId === BANKING_SCHEDULER_TASK_IDS.dws,
  )
  const dwsTaskRun = schedulerRun.taskRuns[BANKING_SCHEDULER_TASK_IDS.dws]

  if (!dwsTask || !dwsTaskRun) {
    throw new Error('存款余额 Quality Event 缺少 DWS task run')
  }

  const partition = {
    column: 'snapshot_date',
    value: BANKING_DEPOSIT_BALANCE_DATE,
  }
  const target = {
    table: 'dws_deposit_balance_daily',
    field: 'deposit_balance',
    partition,
  }
  const evidenceId = `evidence.${BALANCE_RECONCILIATION_RULE_ID}`

  return {
    eventId: `event.quality.${BALANCE_RECONCILIATION_RULE_ID}`,
    eventType: 'quality-check',
    checkId: `check.quality.${BALANCE_RECONCILIATION_RULE_ID}`,
    ruleId: BALANCE_RECONCILIATION_RULE_ID,
    status: 'fail',
    severity: 'critical',
    occurredAt: dwsTaskRun.endedAt ?? schedulerRun.clock,
    target,
    threshold: {
      operator: 'equals',
      value: 0,
      unit: 'currency',
    },
    observedValue: RECONCILIATION_DELTA,
    evidence: [
      {
        evidenceId,
        kind: 'metric-comparison',
        detail: `DWD.balance 合计 ${DWD_BALANCE} 元，DWS.deposit_balance 为 ${DWS_BALANCE} 元，delta = ${RECONCILIATION_DELTA} 元。`,
        observedValue: RECONCILIATION_DELTA,
        expectedValue: 0,
        expectedLabel: 'delta = 0',
        samples: [
          {
            sampleId: 'sample.dwd-dws-balance-reconciliation',
            rowKey: `${BANKING_DEPOSIT_BALANCE_DATE} / deposit_balance`,
            values: {
              business_date: BANKING_DEPOSIT_BALANCE_DATE,
              dwd_balance: DWD_BALANCE,
              dws_deposit_balance: DWS_BALANCE,
              delta: RECONCILIATION_DELTA,
            },
            reason: '同一业务日期的 DWD 明细合计与 DWS 主题汇总不一致。',
          },
        ],
      },
    ],
    schedulerContext: {
      taskId: dwsTask.taskId,
      runId: schedulerRun.runId,
      runStatus: schedulerRun.status,
      taskStatus: dwsTaskRun.status,
      businessDate: schedulerRun.businessDate,
      partition: schedulerRun.partition,
      outputTable: dwsTask.contract.outputTable,
      scheduledAt: schedulerRun.scheduledAt,
      startedAt: dwsTaskRun.startedAt,
      endedAt: dwsTaskRun.endedAt,
    },
    releaseImpact: {
      downstreamRelease: 'blocked',
      isBlocked: true,
      affectedOutputs: ['ads_deposit_balance', '存款余额指标'],
      explanation: 'Quality FAILED；Release BLOCKED，未经调查的 DWS 结果不能继续向下游发布。',
    },
    remediation: {
      action: 'block',
      label: 'block · 阻断',
      steps: [
        '先沿直接上游检查 dwd_account_balance_detail，再决定是否继续向源数据展开。',
        `确认后按 snapshot_date = ${BANKING_DEPOSIT_BALANCE_DATE} 重跑 ${dwsTask.taskId}。`,
      ],
      canRerun: true,
      rerunTaskId: dwsTask.taskId,
    },
    investigationContext: {
      target,
      schedulerTaskId: dwsTask.taskId,
      schedulerRunId: schedulerRun.runId,
      upstreamHints: [
        '先检查 dwd_account_balance_detail；若 DWD 正常，停在当前 DWD → DWS 转换。',
        '若 DWD 已异常，再检查 AccountBalanceSnapshot、Account、Branch、Product 的相关输入。',
      ],
      downstreamImpacts: ['ads_deposit_balance', '存款余额指标'],
      relatedRuleIds: [BALANCE_RECONCILIATION_RULE_ID],
    },
  }
}

export const depositBalanceQualityEvent = createDepositBalanceQualityEvent()
