/**
 * English teaching model for the data contracts page.
 *
 * A contract is an explicit, versioned agreement between the producer of a
 * dataset and its consumers: fields, types, nullability, semantics, keys and
 * the process for changing any of them. The model below is a deterministic
 * change catalogue over one shared banking dataset; it is presentation content
 * for this page, not a runtime contract engine.
 */

export interface ContractField {
  name: string
  type: string
  nullable: boolean
  semantics: string
  consumedBy: readonly string[]
}

export const BASE_CONTRACT_FIELDS: readonly ContractField[] = [
  {
    name: 'account_id',
    type: 'string',
    nullable: false,
    semantics: 'Account identifier; one row per account per snapshot day',
    consumedBy: ['Daily balance report', 'Branch dashboard', 'Regulatory extract'],
  },
  {
    name: 'snapshot_date',
    type: 'date',
    nullable: false,
    semantics: 'Business date the balance represents',
    consumedBy: ['Daily balance report', 'Branch dashboard', 'Regulatory extract'],
  },
  {
    name: 'balance',
    type: 'decimal(18,2)',
    nullable: false,
    semantics: 'Closing balance in CNY yuan, two decimal places',
    consumedBy: ['Daily balance report', 'Branch dashboard', 'Regulatory extract'],
  },
  {
    name: 'currency',
    type: 'string(3)',
    nullable: false,
    semantics: 'Currency code; the report is CNY-only today',
    consumedBy: ['Daily balance report', 'Regulatory extract'],
  },
  {
    name: 'branch_id',
    type: 'string',
    nullable: false,
    semantics: 'Branch the account is booked to',
    consumedBy: ['Branch dashboard', 'Regulatory extract'],
  },
  {
    name: 'updated_at',
    type: 'timestamp',
    nullable: false,
    semantics: 'Row update time in UTC; not the business date',
    consumedBy: ['Branch dashboard'],
  },
]

export const CONTRACT_CHANGE_IDS = [
  'add-nullable-column',
  'add-required-column',
  'narrow-decimal',
  'unit-change',
  'rename-column',
  'remove-column',
  'relax-nullability',
  'add-enum-member',
] as const

export type ContractChangeId = (typeof CONTRACT_CHANGE_IDS)[number]

export type ContractCompatibility = 'compatible' | 'breaking' | 'silent-risk'
export type ContractDetection = 'review' | 'contract-test' | 'runtime' | 'not-until-wrong'
export type ContractConsumerEffect = 'none' | 'loud-failure' | 'silent-wrong' | 'partial-loss'

export interface ContractChange {
  id: ContractChangeId
  label: string
  summary: string
  field: string
  before: string
  after: string
  compatibility: ContractCompatibility
  detectedAt: ContractDetection
  consumerEffect: ContractConsumerEffect
  producerAction: string
  requiredProcess: readonly string[]
  verdict: string
}

export const CONTRACT_CHANGES: readonly ContractChange[] = [
  {
    id: 'add-nullable-column',
    label: 'Add a nullable column',
    summary: 'customer_segment is added and left NULL for existing rows.',
    field: 'customer_segment',
    before: 'does not exist',
    after: 'string, nullable',
    compatibility: 'compatible',
    detectedAt: 'review',
    consumerEffect: 'none',
    producerAction: 'Document the new field and backfill when a rule exists.',
    requiredProcess: [
      'Publish the new field in the contract with its meaning and nullability.',
      'Add a backfill plan; until then, consumers must not assume a value.',
    ],
    verdict: 'Additive and nullable: existing queries keep working.',
  },
  {
    id: 'add-required-column',
    label: 'Add a required column without a default',
    summary: 'balance_cents is added as NOT NULL with no default for existing rows.',
    field: 'balance_cents',
    before: 'does not exist',
    after: 'bigint, not null, no default',
    compatibility: 'breaking',
    detectedAt: 'contract-test',
    consumerEffect: 'loud-failure',
    producerAction: 'Add the column with a default, or make it nullable first.',
    requiredProcess: [
      'Run the consumer contract test before merging; a required field change fails immediately.',
      'If the field is genuinely required, version the dataset and migrate consumers in order.',
    ],
    verdict: 'Required fields break every consumer that inserts or validates rows.',
  },
  {
    id: 'narrow-decimal',
    label: 'Narrow a decimal type',
    summary: 'balance becomes decimal(12,2) instead of decimal(18,2).',
    field: 'balance',
    before: 'decimal(18,2)',
    after: 'decimal(12,2)',
    compatibility: 'silent-risk',
    detectedAt: 'runtime',
    consumerEffect: 'loud-failure',
    producerAction: 'Check the real value range before narrowing a type.',
    requiredProcess: [
      'Measure MAX(ABS(balance)) over real history, not a sample.',
      'Add a range check to the producer and keep the wider type until values fit.',
    ],
    verdict: 'A narrower type passes on small data and overflows on the one large balance.',
  },
  {
    id: 'unit-change',
    label: 'Change the unit of a column',
    summary: 'balance keeps its name and type, but yuan becomes cents.',
    field: 'balance',
    before: 'CNY yuan, decimal(18,2)',
    after: 'CNY cents stored in the same column',
    compatibility: 'silent-risk',
    detectedAt: 'not-until-wrong',
    consumerEffect: 'silent-wrong',
    producerAction:
      'Never reuse a field name for different semantics; add a new field or version it.',
    requiredProcess: [
      'Introduce balance_cents as a new field and dual-write it.',
      'Migrate consumers one by one, then deprecate and remove the old field.',
    ],
    verdict: 'Schema-identical and value-destroying: every downstream total is 100× too large.',
  },
  {
    id: 'rename-column',
    label: 'Rename a column',
    summary: 'balance becomes balance_amount and the old name disappears.',
    field: 'balance',
    before: 'balance',
    after: 'balance_amount',
    compatibility: 'breaking',
    detectedAt: 'runtime',
    consumerEffect: 'loud-failure',
    producerAction: 'Add the new name, keep both during a deprecation window, then remove.',
    requiredProcess: [
      'Dual-write both names for at least one consumer release cycle.',
      'Get written sign-off from every listed consumer before removing the old name.',
    ],
    verdict:
      'Consumers fail loudly, which is painful but honest; the danger is an uncoordinated hotfix.',
  },
  {
    id: 'remove-column',
    label: 'Remove a column',
    summary: 'currency is dropped from the dataset.',
    field: 'currency',
    before: 'string(3), not null',
    after: 'does not exist',
    compatibility: 'breaking',
    detectedAt: 'contract-test',
    consumerEffect: 'loud-failure',
    producerAction: 'Deprecate first; removal is the last step, never the first.',
    requiredProcess: [
      'Announce the deprecation with a date and an owner per consumer.',
      'Remove only after every consumer stops reading the field.',
    ],
    verdict: 'The contract test fails before the producer merges, which is exactly its job.',
  },
  {
    id: 'relax-nullability',
    label: 'Allow a column to be NULL',
    summary: 'branch_id becomes nullable because some upstream rows lack a branch.',
    field: 'branch_id',
    before: 'string, not null',
    after: 'string, nullable',
    compatibility: 'breaking',
    detectedAt: 'runtime',
    consumerEffect: 'partial-loss',
    producerAction: 'State nullability in the contract and agree on consumer behaviour first.',
    requiredProcess: [
      'Decide whether NULL means unknown, unassigned or invalid — they are different.',
      'Update branch aggregates to show or exclude unknowns explicitly; do not drop them silently.',
    ],
    verdict:
      'No error and no query change needed: rows quietly fall out of every branch aggregate.',
  },
  {
    id: 'add-enum-member',
    label: 'Add a value to a coded field',
    summary: 'currency gains EUR alongside CNY.',
    field: 'currency',
    before: 'CNY',
    after: 'CNY, EUR',
    compatibility: 'compatible',
    detectedAt: 'review',
    consumerEffect: 'partial-loss',
    producerAction: 'Tell consumers about new members before the first row arrives.',
    requiredProcess: [
      'Confirm every consumer has a mapping for the new member (rates, labels, rules).',
      'Decide whether the field is open (any code) or closed (agreed set).',
    ],
    verdict: 'The pipeline keeps running, but an unmapped member becomes a mislabelled row.',
  },
]

export interface ContractChangeView {
  id: ContractChangeId
  label: string
  summary: string
  field: string
  before: string
  after: string
  compatibility: ContractCompatibility
  compatibilityLabel: string
  detectedAt: ContractDetection
  detectionLabel: string
  consumerEffect: ContractConsumerEffect
  effectLabel: string
  producerAction: string
  requiredProcess: readonly string[]
  verdict: string
}

export const CONTRACT_COMPATIBILITY_LABELS: Readonly<Record<ContractCompatibility, string>> = {
  compatible: 'compatible',
  breaking: 'breaking change',
  'silent-risk': 'silent risk',
}

export const CONTRACT_DETECTION_LABELS: Readonly<Record<ContractDetection, string>> = {
  review: 'code review',
  'contract-test': 'consumer contract test',
  runtime: 'at runtime',
  'not-until-wrong': 'not until a number is wrong',
}

export const CONTRACT_EFFECT_LABELS: Readonly<Record<ContractConsumerEffect, string>> = {
  none: 'no consumer impact',
  'loud-failure': 'the consumer fails loudly',
  'silent-wrong': 'the consumer shows wrong values',
  'partial-loss': 'rows fall out of some results silently',
}

export function contractChangeView(change: ContractChange): ContractChangeView {
  return {
    id: change.id,
    label: change.label,
    summary: change.summary,
    field: change.field,
    before: change.before,
    after: change.after,
    compatibility: change.compatibility,
    compatibilityLabel: CONTRACT_COMPATIBILITY_LABELS[change.compatibility],
    detectedAt: change.detectedAt,
    detectionLabel: CONTRACT_DETECTION_LABELS[change.detectedAt],
    consumerEffect: change.consumerEffect,
    effectLabel: CONTRACT_EFFECT_LABELS[change.consumerEffect],
    producerAction: change.producerAction,
    requiredProcess: change.requiredProcess,
    verdict: change.verdict,
  }
}

export function findContractChange(id: ContractChangeId): ContractChange {
  const change = CONTRACT_CHANGES.find((candidate) => candidate.id === id)
  if (!change) throw new Error(`Unknown contract change: ${id}`)
  return change
}

export interface ContractChangeReference {
  id: ContractChangeId
  label: string
  field: string
  compatibility: ContractCompatibility
  detectedAt: ContractDetection
  consumerEffect: ContractConsumerEffect
}

export function buildContractReference(): readonly ContractChangeReference[] {
  return CONTRACT_CHANGES.map((change) => ({
    id: change.id,
    label: change.label,
    field: change.field,
    compatibility: change.compatibility,
    detectedAt: change.detectedAt,
    consumerEffect: change.consumerEffect,
  }))
}

/** Changes that keep working until a specific value appears or a consumer reads the field. */
export function silentChanges(): readonly ContractChangeId[] {
  return CONTRACT_CHANGES.filter((change) => change.consumerEffect === 'silent-wrong').map(
    (change) => change.id,
  )
}
