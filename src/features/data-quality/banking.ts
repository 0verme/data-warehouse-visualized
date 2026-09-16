import {
  BANKING_DEPOSIT_BALANCE_DATE,
  BANKING_SCHEDULER_SCHEDULED_AT,
  bankingSchedulerVisualization,
} from '../scheduler/banking'
import type { QualityEvent } from './types'
import {
  QUALITY_RULE_IDS,
  createDataQualityVisualization,
  createQualitySchedulerRun,
  createQualityTeachingModel,
  evaluateDataQuality,
} from '../../utils/data-quality'

/**
 * 第 06 章交给血缘调查的最小真实事件。
 * 质量事件只保留规则观察到的事实；第 07 章通过 adapter 推导调查路径。
 */
export function createDepositBalanceQualityEvent(): QualityEvent {
  const schedulerRun = createQualitySchedulerRun(
    bankingSchedulerVisualization.tasks,
    BANKING_DEPOSIT_BALANCE_DATE,
    'happy-path',
    BANKING_SCHEDULER_SCHEDULED_AT,
  )
  const visualization = createDataQualityVisualization(
    schedulerRun,
    'status',
    createQualityTeachingModel(),
  )
  const evaluation = evaluateDataQuality(visualization, {
    scenario: 'balance-reconciliation-drift',
    action: 'block',
  })
  const event = evaluation.events.find(
    (candidate) => candidate.ruleId === QUALITY_RULE_IDS.reconciliation,
  )

  if (!event) {
    throw new Error('第 06 章的存款余额 Quality Event 需要对账失败事实')
  }

  return event
}

export const depositBalanceQualityEvent = createDepositBalanceQualityEvent()
