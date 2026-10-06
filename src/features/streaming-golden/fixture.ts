import type { StreamingDelivery } from './types'

/** Frozen #75 Phase 1 input: 8 source deliveries, 7 unique business transactions. */
export const STREAMING_GOLDEN_DELIVERIES = [
  {
    offset: 1,
    transactionId: 'TX-001',
    branchId: 'HZ001',
    amountCny: 100,
    currency: 'CNY',
    eventTime: '2026-05-12T10:01:00+08:00',
    arrivalTime: '2026-05-12T10:01:00+08:00',
    processingTime: '2026-05-12T10:01:02+08:00',
    note: '正常到达；属于 10:00–10:05 窗口。',
  },
  {
    offset: 2,
    transactionId: 'TX-002',
    branchId: 'HZ001',
    amountCny: 200,
    currency: 'CNY',
    eventTime: '2026-05-12T10:02:00+08:00',
    arrivalTime: '2026-05-12T10:02:00+08:00',
    processingTime: '2026-05-12T10:02:02+08:00',
    note: '正常到达；与 TX-001 得到首个 300 元结果。',
  },
  {
    offset: 3,
    transactionId: 'TX-003',
    branchId: 'HZ002',
    amountCny: 80,
    currency: 'CNY',
    eventTime: '2026-05-12T10:04:00+08:00',
    arrivalTime: '2026-05-12T10:04:00+08:00',
    processingTime: '2026-05-12T10:04:02+08:00',
    note: '先于 offset 4 到达，但 event time 更晚。',
  },
  {
    offset: 4,
    transactionId: 'TX-004',
    branchId: 'HZ002',
    amountCny: 20,
    currency: 'CNY',
    eventTime: '2026-05-12T10:03:00+08:00',
    arrivalTime: '2026-05-12T10:04:30+08:00',
    processingTime: '2026-05-12T10:04:32+08:00',
    note: 'Out-of-order：event time 早于 offset 3。',
  },
  {
    offset: 5,
    transactionId: 'TX-005',
    branchId: 'HZ001',
    amountCny: 150,
    currency: 'CNY',
    eventTime: '2026-05-12T10:04:00+08:00',
    arrivalTime: '2026-05-12T10:06:00+08:00',
    processingTime: '2026-05-12T10:06:02+08:00',
    note: 'Accepted late event：已发出的旧窗口仍在允许修订期。',
  },
  {
    offset: 6,
    transactionId: 'TX-006',
    branchId: 'HZ001',
    amountCny: 70,
    currency: 'CNY',
    eventTime: '2026-05-12T10:05:00+08:00',
    arrivalTime: '2026-05-12T10:06:30+08:00',
    processingTime: '2026-05-12T10:06:32+08:00',
    note: '半开边界：10:05:00 属于下一窗口。',
  },
  {
    offset: 7,
    transactionId: 'TX-006',
    branchId: 'HZ001',
    amountCny: 70,
    currency: 'CNY',
    eventTime: '2026-05-12T10:05:00+08:00',
    arrivalTime: '2026-05-12T10:06:40+08:00',
    processingTime: '2026-05-12T10:06:53+08:00',
    note: '业务重复投递；与 offset 6 是同一笔交易。',
  },
  {
    offset: 8,
    transactionId: 'TX-008',
    branchId: 'HZ001',
    amountCny: 60,
    currency: 'CNY',
    eventTime: '2026-05-12T10:03:00+08:00',
    arrivalTime: '2026-05-12T10:09:00+08:00',
    processingTime: '2026-05-12T10:09:02+08:00',
    note: 'Finalization 后到达；进入 late evidence，不修改 online final。',
  },
] as const satisfies readonly StreamingDelivery[]

export const STREAMING_WINDOW_MINUTES = 5
export const STREAMING_ALLOWED_LATENESS_MS = 2 * 60 * 1000
export const STREAMING_ON_TIME_WATERMARK = '2026-05-12T10:05:00+08:00'
export const STREAMING_FINAL_WATERMARK = '2026-05-12T10:07:00+08:00'
export const STREAMING_OFFLINE_CUTOFF = '2026-05-13T02:00:00+08:00'
