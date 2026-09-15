import type { LessonContent } from '../types'
import {
  bankingDepositBalanceTaskContract,
  bankingSchedulerVisualization,
  createBankingSchedulerTasks,
  createBankingSchedulerVisualization,
} from '../../features/scheduler/banking'
import { schedulingBusinessDateContent } from './scheduling-business-date'

export {
  bankingDepositBalanceTaskContract,
  bankingSchedulerVisualization,
  createBankingSchedulerTasks,
  createBankingSchedulerVisualization,
}

/** 第 06 章的默认调度事实；各节只改变教学焦点，不复制 DAG 和输入数据。 */
export const schedulerVisualization = bankingSchedulerVisualization

/** 保留旧导出名，方便已有内容消费者逐步迁移到五节课程。 */
export const schedulingSystemContent: LessonContent = schedulingBusinessDateContent
