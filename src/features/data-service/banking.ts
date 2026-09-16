import { depositBalanceTaskContract, DEPOSIT_BALANCE_TARGET_DATE } from '../../data/deposit-balance'
import type {
  DataServiceApiResponse,
  DataServiceChoiceResult,
  DataServiceConsumer,
  DataServiceDecisionScenario,
  DataServiceFileDelivery,
  DataServiceFileStage,
  DataServiceFileState,
  DataServiceMode,
  DataServicePublishedAsset,
  DataServicePublishedBalance,
  DataServiceVisualization,
} from './types'

export const dataServicePublishedAsset: DataServicePublishedAsset = {
  assetName: depositBalanceTaskContract.outputTable,
  label: '已发布的存款余额数据',
  businessDate: DEPOSIT_BALANCE_TARGET_DATE,
  status: '质量检查通过 · 已发布',
  sourceLabel: 'AccountBalanceSnapshot → DWD → DWS → ADS',
  grain: 'Branch × business_date（一行代表一个机构在业务日的已发布余额）',
}

/**
 * 这是交付层使用的最小 projection，不新增银行业务实体，也不改变前置章节的余额口径。
 * 金额只用于演示同一份已发布结果如何被不同消费者读取。
 */
export const dataServicePublishedBalances: readonly DataServicePublishedBalance[] = [
  {
    branchId: 'HZ01',
    branchName: '杭州分行',
    businessDate: '2026-09-29',
    depositBalance: 11_800_000_000,
    previousDepositBalance: 11_600_000_000,
    currency: 'CNY',
  },
  {
    branchId: 'NB01',
    branchName: '宁波分行',
    businessDate: '2026-09-29',
    depositBalance: 8_450_000_000,
    previousDepositBalance: 8_300_000_000,
    currency: 'CNY',
  },
  {
    branchId: 'WZ01',
    branchName: '温州分行',
    businessDate: '2026-09-29',
    depositBalance: 7_050_000_000,
    previousDepositBalance: 6_900_000_000,
    currency: 'CNY',
  },
  {
    branchId: 'HZ01',
    branchName: '杭州分行',
    businessDate: DEPOSIT_BALANCE_TARGET_DATE,
    depositBalance: 12_000_000_000,
    previousDepositBalance: 11_800_000_000,
    currency: 'CNY',
  },
  {
    branchId: 'NB01',
    branchName: '宁波分行',
    businessDate: DEPOSIT_BALANCE_TARGET_DATE,
    depositBalance: 8_600_000_000,
    previousDepositBalance: 8_450_000_000,
    currency: 'CNY',
  },
  {
    branchId: 'WZ01',
    branchName: '温州分行',
    businessDate: DEPOSIT_BALANCE_TARGET_DATE,
    depositBalance: 7_200_000_000,
    previousDepositBalance: 7_050_000_000,
    currency: 'CNY',
  },
]

export const dataServiceFileDelivery: DataServiceFileDelivery = {
  dataFileName: 'deposit_balance_20260930.txt',
  flagFileName: 'deposit_balance_20260930.flag',
  businessDate: DEPOSIT_BALANCE_TARGET_DATE,
  delimiter: '|',
  encoding: 'UTF-8',
  fieldOrder: ['branch_id', 'business_date', 'deposit_balance', 'currency'],
  deliveryType: 'full',
  transferHint: '约定目录、FTP 或 SFTP 均可承载这份批量交付，关键是双方遵守完成标志约定。',
}

export const dataServiceApiExample = {
  method: 'GET' as const,
  route: '/api/deposit-balances',
  defaultBranchId: 'HZ01',
  defaultBusinessDate: DEPOSIT_BALANCE_TARGET_DATE,
  parameters: [
    { key: 'branch_id', label: '机构', description: '要查询的机构业务标识。' },
    { key: 'business_date', label: '业务日期', description: '已发布日终余额所属的业务日期。' },
  ],
  responseFields: ['branch_id', 'business_date', 'deposit_balance', 'currency'],
} as const

export const dataServiceDecisionScenarios: readonly DataServiceDecisionScenario[] = [
  {
    id: 'people-view',
    label: '场景 A',
    title: '经营人员每天查看各机构存款余额和趋势。',
    description: '需要筛选机构、查看趋势，并由人主动判断今天的经营情况。',
    recommendedConsumer: 'report',
    reason: '主要消费者是人，报表 / BI 更适合把同一份已发布数据组织成可筛选、可比较的视图。',
  },
  {
    id: 'system-batch',
    label: '场景 B',
    title: '下游系统每天接收上一业务日几十万 / 上百万行数据，完成后开始自己的批处理。',
    description: '需要一次接收一整批数据，并明确什么时候可以启动后续处理。',
    recommendedConsumer: 'file',
    reason: '主要问题是批量交换和完成边界，TXT + FLAG 能把数据文件与“可以消费”的信号分开。',
  },
  {
    id: 'system-request',
    label: '场景 C',
    title: '业务页面根据机构和业务日期，每次查询一条或少量已发布存款余额。',
    description: '页面按条件发起查询，不需要每天搬运整批文件。',
    recommendedConsumer: 'api',
    reason: '主要问题是按条件获取少量结果，API 可以用稳定参数和响应契约完成一次请求。',
  },
]

export function createDataServiceVisualization(mode: DataServiceMode): DataServiceVisualization {
  return {
    kind: 'data-service',
    mode,
    asset: dataServicePublishedAsset,
    publishedBalances: dataServicePublishedBalances,
    file: dataServiceFileDelivery,
    api: dataServiceApiExample,
    scenarios: dataServiceDecisionScenarios,
  }
}

export function getDataServiceApiResponse(
  balances: readonly DataServicePublishedBalance[],
  branchId: string,
  businessDate: string,
): DataServiceApiResponse | undefined {
  const balance = balances.find(
    (row) => row.branchId === branchId && row.businessDate === businessDate,
  )

  if (!balance) {
    return undefined
  }

  return {
    branch_id: balance.branchId,
    business_date: balance.businessDate,
    deposit_balance: balance.depositBalance,
    currency: balance.currency,
  }
}

export function getDataServiceFileState(stage: DataServiceFileStage): DataServiceFileState {
  const isComplete = stage === 'complete'

  return {
    dataFileVisible: true,
    flagFileVisible: isComplete,
    canConsume: isComplete,
    status: isComplete ? 'ready' : 'in-progress',
    statusLabel: isComplete
      ? 'FLAG 已出现，这批数据可以消费。'
      : 'TXT 已出现，但文件仍可能在写入，暂时不能消费。',
  }
}

const consumerLabels: Record<DataServiceConsumer, string> = {
  report: '报表 / BI',
  file: '文件接口',
  api: 'API',
}

export function getDataServiceConsumerLabel(consumer: DataServiceConsumer): string {
  return consumerLabels[consumer]
}

export function getDataServiceChoiceResult(
  scenario: DataServiceDecisionScenario,
  selectedConsumer: DataServiceConsumer,
): DataServiceChoiceResult {
  const label = getDataServiceConsumerLabel(scenario.recommendedConsumer)

  if (scenario.recommendedConsumer === selectedConsumer) {
    return {
      isCorrect: true,
      label,
      explanation: scenario.reason,
    }
  }

  return {
    isCorrect: false,
    label,
    explanation: `当前需求更符合${label}。${scenario.reason}`,
  }
}
