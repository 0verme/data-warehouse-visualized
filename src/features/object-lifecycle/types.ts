export type ObjectLifecycleStrategy = 'drop-ctas' | 'fixed-table'

export type ObjectLifecycleEvent =
  'success' | 'after-create-failure' | 'insert-failure' | 'schema-change' | 'retry'

export type ObjectLifecycleTone = 'success' | 'danger' | 'caution' | 'neutral'

export interface ObjectLifecycleSelection {
  readonly strategy: ObjectLifecycleStrategy
  readonly event: ObjectLifecycleEvent
}

export type ObjectLifecycleAction =
  | { readonly type: 'select-strategy'; readonly strategy: ObjectLifecycleStrategy }
  | { readonly type: 'select-event'; readonly event: ObjectLifecycleEvent }
  | { readonly type: 'reset' }

export interface ObjectLifecycleOperation {
  readonly title: string
  readonly detail: string
  readonly state: 'done' | 'failed' | 'pending'
}

export interface ObjectLifecycleObservation {
  readonly label: string
  readonly value: string
  readonly detail: string
}

export interface ObjectLifecycleSnapshot {
  readonly strategy: ObjectLifecycleStrategy
  readonly event: ObjectLifecycleEvent
  readonly runStatus: string
  readonly tone: ObjectLifecycleTone
  readonly targetExists: boolean
  readonly objectIdentity: string
  readonly visibleData: string
  readonly schema: string
  readonly operations: readonly ObjectLifecycleOperation[]
  readonly observations: readonly ObjectLifecycleObservation[]
  readonly conclusion: string
  readonly transactionNote: string
}
