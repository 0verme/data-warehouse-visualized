import type { TeachingTableRow } from '../../types'
import type { GrainErrorStepSpecs } from '../grain-error/steps'
import { calculateLoanGrainErrorResult } from '../../utils/loan-grain'

export type EnglishGrainId = 'contract' | 'disbursement' | 'repayment'

export interface EnglishGrainOption {
  readonly id: EnglishGrainId
  readonly label: string
  readonly statement: string
  readonly identity: string
  readonly primaryKey: string
  readonly rowMeaning: string
  readonly columns: readonly string[]
  readonly rows: readonly TeachingTableRow[]
  readonly amountField: string
  readonly amountLabel: string
  readonly amountTotal: number
  readonly canAnswer: readonly string[]
  readonly cannotAnswer: readonly string[]
}

/**
 * Same deterministic loan chain as the Chinese lesson, presented with English
 * terms. Contract CT-1001 is worth 600,000; it has two disbursements and three
 * repayments, so the same business relationship has three different grains.
 */
export const englishGrainOptions: readonly EnglishGrainOption[] = [
  {
    id: 'contract',
    label: 'Contract grain',
    statement: 'one row = one loan contract',
    identity: 'contract_id',
    primaryKey: 'contract_id',
    rowMeaning:
      'The row describes the agreed contract. It does not say how many disbursements or repayments have happened.',
    columns: ['contract_id', 'contract_amount'],
    rows: [{ contract_id: 'CT-1001', contract_amount: 600000 }],
    amountField: 'contract_amount',
    amountLabel: 'Agreed contract amount',
    amountTotal: 600000,
    canAnswer: ['Number of contracts', 'Agreed contract amount'],
    cannotAnswer: ['Disbursement count or principal', 'What happened on each repayment'],
  },
  {
    id: 'disbursement',
    label: 'Disbursement grain',
    statement: 'one row = one actual disbursement',
    identity: 'note_id',
    primaryKey: 'note_id',
    rowMeaning:
      'The row is one disbursement under the contract, and its amount matches the principal actually released.',
    columns: ['note_id', 'contract_id', 'disbursed_principal'],
    rows: [
      { note_id: 'LN-01', contract_id: 'CT-1001', disbursed_principal: 300000 },
      { note_id: 'LN-02', contract_id: 'CT-1001', disbursed_principal: 150000 },
    ],
    amountField: 'disbursed_principal',
    amountLabel: 'Disbursed principal',
    amountTotal: 450000,
    canAnswer: ['Disbursement count and principal', 'Disbursement-level analysis'],
    cannotAnswer: [
      'Listing every repayment row directly',
      'Copying the contract amount onto each note and summing it',
    ],
  },
  {
    id: 'repayment',
    label: 'Repayment grain',
    statement: 'one row = one actual repayment',
    identity: 'repayment_id',
    primaryKey: 'repayment_id',
    rowMeaning:
      'The row is one repayment event, and its amount matches the money returned in that event.',
    columns: ['repayment_id', 'note_id', 'repayment_amount'],
    rows: [
      { repayment_id: 'RP-01', note_id: 'LN-01', repayment_amount: 50000 },
      { repayment_id: 'RP-02', note_id: 'LN-01', repayment_amount: 25000 },
      { repayment_id: 'RP-03', note_id: 'LN-02', repayment_amount: 10000 },
    ],
    amountField: 'repayment_amount',
    amountLabel: 'Repaid amount',
    amountTotal: 85000,
    canAnswer: ['Repayment count and amount repaid', 'Tracing repayments per note'],
    cannotAnswer: [
      'Treating one row as one disbursement principal',
      'Answering the agreed contract amount without a join',
    ],
  },
]

/**
 * Wrong-grain demo reused from the Chinese grain lesson: joining the contract
 * amount to the two disbursements copies 600,000 twice.
 */
export const englishGrainErrorDemo = {
  wrongColumns: ['contract_id', 'note_id', 'contract_amount'],
  wrongRows: [
    { contract_id: 'CT-1001', note_id: 'LN-01', contract_amount: 600000 },
    { contract_id: 'CT-1001', note_id: 'LN-02', contract_amount: 600000 },
  ],
  fixedColumns: ['contract_id', 'contract_amount'],
  fixedRows: [{ contract_id: 'CT-1001', contract_amount: 600000 }],
  actualContractAmount: 600000,
  wrongMeasure: 'contract_amount',
  fixedMeasure: 'contract_amount',
  wrongSql: 'SELECT SUM(contract_amount) -- over contract ⋈ disbursements',
  fixedSql: 'SELECT SUM(contract_amount) -- after returning to contract grain',
}

export type EnglishGrainErrorStepId = 'joined' | 'aggregated' | 'fixed'

export const englishGrainErrorStepSpecs = [
  {
    id: 'joined',
    title: 'Wrong grain',
    description:
      'The contract amount is copied onto every disbursement row, so the same 600,000 now appears twice.',
    risk: true,
  },
  {
    id: 'aggregated',
    title: 'The SUM exposes it',
    description:
      'SUM(contract_amount) adds the copies and returns 1,200,000. The function is fine; the row it runs on is not a contract row.',
    risk: true,
  },
  {
    id: 'fixed',
    title: 'Back to the contract grain',
    description:
      'Keep one row per contract before summing. The result returns to 600,000 and the disbursement principal stays a separate measure.',
    risk: false,
  },
] as const satisfies GrainErrorStepSpecs<EnglishGrainErrorStepId>

export function getEnglishGrainOption(
  options: readonly EnglishGrainOption[],
  id: EnglishGrainId,
): EnglishGrainOption | undefined {
  return options.find((option) => option.id === id)
}

export function createEnglishGrainErrorResult() {
  return calculateLoanGrainErrorResult(englishGrainErrorDemo)
}
