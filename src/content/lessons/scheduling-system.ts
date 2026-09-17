import {
  bankingDepositBalanceTaskContract,
  bankingSchedulerVisualization,
  createBankingSchedulerTasks,
  createBankingSchedulerVisualization,
} from '../../features/scheduler/banking'

export {
  bankingDepositBalanceTaskContract,
  bankingSchedulerVisualization,
  createBankingSchedulerTasks,
  createBankingSchedulerVisualization,
}

/** 第 05 章的默认调度事实；各节只改变教学焦点，不复制 DAG 和输入数据。 */
export const schedulerVisualization = bankingSchedulerVisualization
