import { describe, expect, it } from 'vitest'
import { lakehouseVisualizations } from '../src/content/lessons/lakehouse'
import { buildEnglishLakehouseFixture } from '../src/features/english-lakehouse/fixture'
import { getEnglishLakehouseScenario } from '../src/features/english-lakehouse/model'

const cjkOrReplacement = /[\u3400-\u9fff\uFFFD]/u

describe('English lakehouse table-state model', () => {
  it('projects the existing table-layer fixture into English, serializable snapshots', () => {
    const sourceBefore = JSON.stringify(lakehouseVisualizations.tableLayer)
    const fixture = buildEnglishLakehouseFixture()
    const versionOne = fixture.snapshots.find((snapshot) => snapshot.version === 1)
    const versionTwo = fixture.snapshots.find((snapshot) => snapshot.version === 2)

    expect(fixture).toMatchObject({
      tableName: 'mobile_banking_events',
      fileCount: 10,
      failureAt: 6,
      formatExamples: ['Apache Iceberg', 'Delta Lake', 'Apache Hudi'],
    })
    expect(versionOne?.columns).toEqual(['event_id', 'customer_id', 'event_type', 'event_time'])
    expect(versionOne?.rows).toHaveLength(2)
    expect(versionTwo?.columns).toEqual([
      'event_id',
      'customer_id',
      'event_type',
      'event_time',
      'channel',
    ])
    expect(versionTwo?.rows).toHaveLength(3)
    expect(versionTwo?.rows.slice(0, 2).map((row) => row.channel)).toEqual([null, null])
    expect(versionTwo?.rows[2]).toMatchObject({ event_id: 'MB003', channel: 'mobile-app' })
    expect(JSON.stringify(fixture)).not.toMatch(cjkOrReplacement)
    expect(JSON.stringify(lakehouseVisualizations.tableLayer)).toBe(sourceBefore)
  })

  it('distinguishes files written from files included in a committed table state', () => {
    const fixture = buildEnglishLakehouseFixture()
    const failed = getEnglishLakehouseScenario(fixture, 'failed')
    const committed = getEnglishLakehouseScenario(fixture, 'committed')

    expect(fixture.scenarios.failed).toMatchObject({
      publishedVersion: 1,
      queryTargetVersion: 1,
      readerVersion: 1,
      metadataStatus: 'uncommitted',
      pointerMoved: false,
      fileBatch: { attempted: 10, written: 5, committed: 0 },
    })
    expect(failed.fileMessage).toContain('5 of 10 files were written')
    expect(failed.fileMessage).toContain('none are included in a committed snapshot')
    expect(failed.readerSnapshot.version).toBe(1)
    expect(failed.currentSnapshot.version).toBe(1)

    expect(fixture.scenarios.committed).toMatchObject({
      publishedVersion: 2,
      queryTargetVersion: 2,
      readerVersion: 2,
      metadataStatus: 'committed',
      pointerMoved: true,
      fileBatch: { attempted: 10, written: 10, committed: 10 },
    })
    expect(committed.readerSnapshot.version).toBe(2)
    expect(committed.pointerMessage).toContain('v1 → v2')
  })

  it('keeps a historical query target separate from the current published pointer', () => {
    const fixture = buildEnglishLakehouseFixture()
    const historical = getEnglishLakehouseScenario(fixture, 'time-travel')

    expect(fixture.scenarios['time-travel']).toMatchObject({
      publishedVersion: 2,
      queryTargetVersion: 1,
      readerVersion: 1,
      metadataStatus: 'committed',
      pointerMoved: true,
    })
    expect(historical.currentSnapshot.version).toBe(2)
    expect(historical.readerSnapshot.version).toBe(1)
    expect(historical.pointerMessage).toContain('does not move it back')
    expect(historical.readerMessage).toContain('current table state is still v2')
  })
})
