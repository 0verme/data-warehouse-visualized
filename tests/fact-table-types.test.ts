import { describe, expect, it } from 'vitest'
import { factTableTypesContent } from '../src/content/lessons/fact-table-types'
import { getLessonBySlug } from '../src/data/course'
import type { BankingFactTypesVisualization } from '../src/types'
import { getBankingFactType, getLoanNoteLifecycleSnapshot } from '../src/utils/banking-fact-types'

let visualization: BankingFactTypesVisualization | undefined

for (const section of factTableTypesContent.sections) {
  if (section.kind === 'visualization' && section.visualization.kind === 'banking-fact-types') {
    visualization = section.visualization
    break
  }
}

if (!visualization) {
  throw new Error('事实表类型测试需要 banking-fact-types visualization 数据')
}

describe('事实表不只有一种课程数据', () => {
  it('注册三类 Fact Table，并使用各自的银行样本', () => {
    expect(getLessonBySlug('fact-table-types')).toMatchObject({
      title: '事实表不只有一种',
      chapter: '03',
      order: 400,
      demo: 'banking-fact-types',
    })
    expect(visualization.factTypes.map((factType) => factType.id)).toEqual([
      'transaction',
      'periodic-snapshot',
      'accumulating-snapshot',
    ])
    expect(getBankingFactType(visualization.factTypes, 'transaction')?.rows[0]).toMatchObject({
      transaction_id: 'T001',
      transaction_amount: 2000,
    })
    expect(getBankingFactType(visualization.factTypes, 'periodic-snapshot')?.rows).toHaveLength(3)
    expect(getBankingFactType(visualization.factTypes, 'periodic-snapshot')?.rows[1]).toMatchObject(
      {
        snapshot_date: '2026-09-14',
        transaction_count: 0,
      },
    )
  })

  it('累积快照使用 LoanNote 生命周期，并在同一行补齐里程碑', () => {
    const lifecycle = visualization.loanNoteLifecycle

    expect(lifecycle.noteId).toBe('N001')
    expect(lifecycle.milestones.map((milestone) => milestone.field)).toEqual([
      'disbursed_date',
      'first_due_date',
      'first_repayment_date',
      'overdue_date',
      'settled_date',
    ])
    expect(getLoanNoteLifecycleSnapshot(lifecycle, 0)).toMatchObject({
      note_id: 'N001',
      disbursed_date: '2026-01-08',
      first_due_date: '—',
      current_status: '已放款',
    })
    expect(getLoanNoteLifecycleSnapshot(lifecycle, 4)).toMatchObject({
      note_id: 'N001',
      first_repayment_date: '2026-02-03',
      settled_date: '2026-06-30',
      current_status: '已结清',
    })
  })
})
