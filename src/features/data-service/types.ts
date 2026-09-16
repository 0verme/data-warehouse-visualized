export type DataServiceMode = 'overview' | 'report' | 'file' | 'api' | 'decision'

export type DataServiceConsumer = 'report' | 'file' | 'api'

export type DataServiceFileStage = 'txt' | 'complete'

export type DataServiceReportView = 'table' | 'trend'

export interface DataServicePublishedAsset {
  assetName: string
  label: string
  businessDate: string
  status: string
  sourceLabel: string
  grain: string
}

/** A delivery projection of the published branch-level deposit balance asset. */
export interface DataServicePublishedBalance {
  branchId: string
  branchName: string
  businessDate: string
  depositBalance: number
  previousDepositBalance: number
  currency: 'CNY'
  /** Capstone projection fields; legacy deposit-only consumers may omit them. */
  loanBalance?: number
  loanDepositRatio?: number | null
  loanDepositRatioStatus?: 'calculated' | 'not-calculable'
}

export interface DataServiceFileDelivery {
  dataFileName: string
  flagFileName: string
  businessDate: string
  delimiter: string
  encoding: string
  fieldOrder: readonly string[]
  deliveryType: 'full' | 'incremental'
  transferHint: string
}

export interface DataServiceApiParameter {
  key: string
  label: string
  description: string
}

export interface DataServiceApiExample {
  method: 'GET'
  route: string
  defaultBranchId: string
  defaultBusinessDate: string
  parameters: readonly DataServiceApiParameter[]
  responseFields: readonly string[]
}

export interface DataServiceDecisionScenario {
  id: string
  label: string
  title: string
  description: string
  recommendedConsumer: DataServiceConsumer
  reason: string
}

export interface DataServiceVisualization {
  kind: 'data-service'
  mode: DataServiceMode
  asset: DataServicePublishedAsset
  publishedBalances: readonly DataServicePublishedBalance[]
  file: DataServiceFileDelivery
  api: DataServiceApiExample
  scenarios: readonly DataServiceDecisionScenario[]
}

export interface DataServiceApiResponse {
  branch_id: string
  business_date: string
  deposit_balance: number
  currency: 'CNY'
  /** Capstone projection fields; legacy deposit-only responses remain unchanged. */
  loan_balance?: number
  loan_deposit_ratio?: number | null
  loan_deposit_ratio_status?: 'calculated' | 'not-calculable'
}

export interface DataServiceFileState {
  dataFileVisible: true
  flagFileVisible: boolean
  canConsume: boolean
  status: 'in-progress' | 'ready'
  statusLabel: string
}

export interface DataServiceChoiceResult {
  isCorrect: boolean
  label: string
  explanation: string
}
