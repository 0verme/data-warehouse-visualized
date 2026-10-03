import type { BankingCustomerHistoryVisualization, BankingCustomerVersion } from '../../types'
import {
  applyCustomerType1Update,
  applyCustomerType2Update,
  getCustomerHistoryCursorView,
  getCustomerVersionAt,
} from '../../utils/customer-history'

/**
 * English SCD Type 2 fixture. The deterministic date utilities in
 * `src/utils/customer-history.ts` are reused unchanged; only the labels differ.
 */
export const englishCustomerHistory: BankingCustomerHistoryVisualization = {
  kind: 'banking-customer-history',
  initialVersion: {
    customerSk: 1001,
    customerId: 'C-100',
    level: 'Standard',
    branch: 'Austin',
    effectiveFrom: '2025-01-01',
    effectiveTo: '9999-12-31',
    isCurrent: true,
  },
  change: {
    customerSk: 2002,
    effectiveFrom: '2026-03-01',
    level: 'Premium',
    branch: 'Denver',
  },
  loanNote: {
    noteId: 'LN-77',
    customerId: 'C-100',
    disbursedDate: '2025-11-15',
    disbursedPrincipal: 250000,
  },
  timeline: [
    {
      date: '2025-01-01',
      label: 'Initial version',
      detail: 'Standard · Austin becomes effective',
      kind: 'start',
    },
    {
      date: '2025-11-15',
      label: 'Loan LN-77',
      detail: 'Historical disbursement of $250,000',
      kind: 'loan-note',
    },
    {
      date: '2026-03-01',
      label: 'Attribute change',
      detail: 'Level and branch change to Premium · Denver',
      kind: 'change',
    },
    {
      date: '2026-06-30',
      label: 'Today',
      detail: 'Premium · Denver is the current version',
      kind: 'now',
    },
  ],
}

export type ScdMode = 'type1' | 'type2'

export function createType1Versions(): BankingCustomerVersion[] {
  const { level, branch } = englishCustomerHistory.change
  return [applyCustomerType1Update(englishCustomerHistory.initialVersion, { level, branch })]
}

export function createType2Versions(): BankingCustomerVersion[] {
  return applyCustomerType2Update(
    [englishCustomerHistory.initialVersion],
    englishCustomerHistory.change,
  )
}

export function createScdView(mode: ScdMode, cursorIndex: number) {
  const versions = mode === 'type1' ? createType1Versions() : createType2Versions()
  const view = getCustomerHistoryCursorView(englishCustomerHistory, versions, cursorIndex)

  return {
    versions,
    view,
    loanMatch: getCustomerVersionAt(versions, englishCustomerHistory.loanNote.disbursedDate),
  }
}

export function formatScdDate(date: string): string {
  return date === '9999-12-31' ? 'open' : date
}
