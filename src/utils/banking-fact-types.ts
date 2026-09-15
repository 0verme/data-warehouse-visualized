import type {
  BankingFactTypeDefinition,
  BankingFactTypeId,
  LoanNoteLifecycleDefinition,
  TeachingTableRow,
} from '../types'

export function getBankingFactType(
  factTypes: readonly BankingFactTypeDefinition[],
  factTypeId: BankingFactTypeId,
): BankingFactTypeDefinition | undefined {
  return factTypes.find((factType) => factType.id === factTypeId)
}

export function getLoanNoteLifecycleSnapshot(
  lifecycle: LoanNoteLifecycleDefinition,
  milestoneIndex: number,
): TeachingTableRow {
  const activeIndex = Math.max(0, Math.min(milestoneIndex, lifecycle.milestones.length - 1))
  const activeMilestone = lifecycle.milestones[activeIndex]
  const values: TeachingTableRow = {
    note_id: lifecycle.noteId,
    disbursed_date: '—',
    first_due_date: '—',
    first_repayment_date: '—',
    overdue_date: '—',
    settled_date: '—',
    current_status: activeMilestone?.status ?? '未开始',
  }

  lifecycle.milestones.forEach((milestone, index) => {
    if (index <= activeIndex) {
      values[milestone.field] = milestone.date
    }
  })

  return values
}
