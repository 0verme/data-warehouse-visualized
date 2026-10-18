import { describe, expect, it } from 'vitest'
import { sqlTransformationLayersContent } from '../src/content/lessons/sql-and-transformation-layers'
import { buildEtlEltFixture } from '../src/features/english-etl-elt/model'
import { buildEtlEltPlacementModel } from '../src/features/english-etl-elt/placement'

const cjkOrReplacement = /[\u3400-\u9fff\uFFFD]/u

describe('English ETL vs ELT placement model', () => {
  it('derives the same checkable result from the existing transformation lesson fixture', () => {
    const fixture = buildEtlEltFixture()
    const model = buildEtlEltPlacementModel(fixture, 'retain')

    expect(model).toMatchObject({
      snapshotDate: '2026-09-30',
      rawRows: 5,
      standardizedRows: 4,
      groupedRows: 3,
      publishedRows: 1,
      publishedAmount: 300_000,
    })
    expect(model.paths.map(({ id, boundaryRows }) => [id, boundaryRows])).toEqual([
      ['etl', 1],
      ['elt', 5],
    ])
  })

  it('keeps raw retention and replay as explicit policy choices, not inherent ETL/ELT behavior', () => {
    const fixture = buildEtlEltFixture()
    const retained = buildEtlEltPlacementModel(fixture, 'retain')
    const discarded = buildEtlEltPlacementModel(fixture, 'discard')

    expect(
      retained.paths.map(({ rawRowsRetained, replayAvailable }) => [
        rawRowsRetained,
        replayAvailable,
      ]),
    ).toEqual([
      [5, true],
      [5, true],
    ])
    expect(retained.paths.map(({ rawRetentionLocation }) => rawRetentionLocation)).toEqual([
      'Upstream source archive, outside this warehouse load',
      'Warehouse landing table',
    ])
    expect(
      discarded.paths.map(({ rawRowsRetained, replayAvailable }) => [
        rawRowsRetained,
        replayAvailable,
      ]),
    ).toEqual([
      [0, false],
      [0, false],
    ])
    expect(
      discarded.paths.map(({ boundaryRows, replayDescription }) => [
        boundaryRows,
        replayDescription,
      ]),
    ).toEqual([
      [1, 'The published aggregate alone cannot reconstruct the original source rows.'],
      [5, 'The published aggregate alone cannot reconstruct the original source rows.'],
    ])
  })

  it('returns deterministic English-only view data without mutating the lesson fixture', () => {
    const fixtureBefore = JSON.stringify(sqlTransformationLayersContent)
    const fixture = buildEtlEltFixture()
    const first = buildEtlEltPlacementModel(fixture, 'retain')
    const second = buildEtlEltPlacementModel(fixture, 'retain')

    expect(first).toEqual(second)
    expect(JSON.stringify({ fixture, model: first })).not.toMatch(cjkOrReplacement)
    expect(JSON.stringify(sqlTransformationLayersContent)).toBe(fixtureBefore)
  })
})
