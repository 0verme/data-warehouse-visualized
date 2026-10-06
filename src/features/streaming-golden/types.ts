import type { StepKernel, VisualizationStep } from '../../utils/visualization-steps'

export type StreamingClockBasis = 'event_time' | 'arrival_time' | 'processing_time'

export interface StreamingDelivery {
  readonly offset: number
  readonly transactionId: string
  readonly branchId: string
  readonly amountCny: number
  readonly currency: 'CNY'
  readonly eventTime: string
  readonly arrivalTime: string
  readonly processingTime: string
  readonly note: string
}

export interface StreamingWindow {
  readonly start: string
  readonly end: string
}

export type StreamingWindowLifecycle = 'OPEN' | 'ALLOWED_LATE' | 'FINAL'

export interface StreamingAggregate {
  readonly branchId: string
  readonly windowStart: string
  readonly windowEnd: string
  readonly currency: 'CNY'
  readonly transactionIds: readonly string[]
  readonly count: number
  readonly amountCny: number
}

export type StreamingDeliveryDisposition =
  'accepted' | 'revised' | 'business-duplicate' | 'too-late'

export interface StreamingDeliveryDecision {
  readonly offset: number
  readonly transactionId: string
  readonly disposition: StreamingDeliveryDisposition
  readonly isOutOfOrder: boolean
  readonly window: StreamingWindow
}

export interface StreamingState {
  /** Highest source delivery offset observed, including duplicates and side output. */
  readonly sourcePosition: number
  /** Event-time completeness estimate; independent of sourcePosition. */
  readonly watermark: string | null
  readonly maxEventTimeSeen: string | null
  readonly seenTransactionIds: readonly string[]
  readonly aggregates: readonly StreamingAggregate[]
  readonly decisions: readonly StreamingDeliveryDecision[]
  readonly sideOutputOffsets: readonly number[]
}

export interface MicrobatchSnapshot {
  readonly tick: string
  readonly throughOffset: number
  readonly sourcePosition: number
  readonly watermark: string
  readonly oldWindowAmountCny: number
  readonly nextWindowAmountCny: number
  readonly sideOutputOffsets: readonly number[]
}

export interface ReconciliationRow {
  readonly branchId: string
  readonly windowStart: string
  readonly windowEnd: string
  readonly currency: 'CNY'
  readonly onlineCount: number
  readonly onlineAmountCny: number
  readonly offlineCount: number
  readonly offlineAmountCny: number
  readonly countDifference: number
  readonly amountDifferenceCny: number
  readonly differenceTransactionIds: readonly string[]
  readonly onlineLifecycle: StreamingWindowLifecycle
}

export interface RecoveryCaseA {
  readonly sourcePosition: number
  readonly operatorStateOffset: number
  readonly skippedOffsets: readonly number[]
  readonly missingTransactionIds: readonly string[]
}

export interface RecoveryCaseB {
  readonly sourcePosition: number
  readonly operatorStateOffset: number
  readonly replayedOffsets: readonly number[]
  readonly appendWritesBeforeFailure: number
  readonly appendWritesAfterReplay: number
  readonly duplicateAppendWrites: number
  readonly upsertRowsByGrain: number
  readonly businessDuplicateOffset: number
  readonly businessDuplicateTransactionId: string
}

export interface StreamingRecoveryEvidence {
  readonly caseA: RecoveryCaseA
  readonly caseB: RecoveryCaseB
}

export type StreamingGoldenStepId =
  | 'bounded-input'
  | 'three-clocks'
  | 'window-state'
  | 'late-watermark'
  | 'stream-state'
  | 'checkpoint-replay'
  | 'reconciliation'

export interface StreamingGoldenStepState {
  readonly stage: StreamingGoldenStepId
  readonly focusOffset?: number
}

export type StreamingGoldenStep = VisualizationStep<StreamingGoldenStepState>
export type StreamingGoldenKernel = StepKernel<StreamingGoldenStepState>

export interface StreamingGoldenLessonSession {
  readonly player: {
    readonly currentIndex: number
    readonly stepCount: number
  }
  readonly stream: StreamingState
  readonly selectedClock: StreamingClockBasis
  readonly recovery: StreamingRecoveryEvidence | null
}

export type StreamingGoldenLessonAction =
  | { readonly type: 'next' }
  | { readonly type: 'select-clock'; readonly clock: StreamingClockBasis }
  | { readonly type: 'inject-late-event' }
  | { readonly type: 'advance-watermark' }
  | { readonly type: 'restore-replay' }

export interface StreamingGoldenVisualization {
  readonly kind: 'streaming-golden'
}
