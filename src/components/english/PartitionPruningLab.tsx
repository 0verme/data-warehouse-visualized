import { useState } from 'react'
import {
  getPartitionPruningSnapshot,
  type PartitionPredicateShape,
} from '../../features/english-partition-pruning/model'

const PREDICATE_CHOICES: readonly {
  id: PartitionPredicateShape
  label: string
  detail: string
}[] = [
  {
    id: 'typed-range',
    label: 'Direct typed date range',
    detail: 'A half-open range on the partition key',
  },
  {
    id: 'wrapped-key',
    label: 'Function on the partition key',
    detail: 'A wrapped expression the fixture treats as opaque',
  },
]

export function PartitionPruningLab() {
  const [shape, setShape] = useState<PartitionPredicateShape>('typed-range')
  const snapshot = getPartitionPruningSnapshot(shape)
  const scanPercent = (snapshot.scannedPartitions / snapshot.totalPartitions) * 100
  const explanation =
    shape === 'typed-range'
      ? 'In this fixture, the direct typed range matches 30 daily partitions. Verify the equivalent partition filter in your own query plan.'
      : 'This fixture conservatively treats the wrapped key as opaque and scans the full history. Some engines can rewrite expressions; check the actual plan instead of assuming.'

  return (
    <div
      className="english-partition-pruning-lab"
      data-pruning-lab
      data-pruning-shape={shape}
      data-pruning-total-partitions={snapshot.totalPartitions}
      data-pruning-scanned-partitions={snapshot.scannedPartitions}
      data-pruning-skipped-partitions={snapshot.skippedPartitions}
      data-pruning-scan-bytes={snapshot.scanBytes}
      data-pruning-file-count={snapshot.fileCount}
    >
      <div className="english-partition-pruning-lab__header">
        <div>
          <p className="english-partition-pruning-lab__eyebrow">Teaching fixture · scan scope</p>
          <h3>Does the predicate reach the partition key?</h3>
          <p>
            Compare two predicate shapes against the same 1,095-partition scan fixture. The
            displayed outcome is a teaching contrast, not an optimizer prediction.
          </p>
        </div>
      </div>

      <div
        className="english-partition-pruning-lab__controls"
        role="group"
        aria-label="Choose a partition predicate shape"
      >
        {PREDICATE_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            data-pruning-shape-button={choice.id}
            aria-pressed={shape === choice.id}
            onClick={() => setShape(choice.id)}
          >
            <strong>{choice.label}</strong>
            <span>{choice.detail}</span>
          </button>
        ))}
      </div>

      <div className="english-partition-pruning-lab__scope">
        <div className="english-partition-pruning-lab__scope-heading">
          <strong>Partitions scanned in the fixture</strong>
          <span>
            {snapshot.scannedPartitions.toLocaleString('en-US')} of{' '}
            {snapshot.totalPartitions.toLocaleString('en-US')}
          </span>
        </div>
        <div
          className="english-partition-pruning-lab__meter"
          role="meter"
          data-pruning-meter
          aria-label="Illustrative partitions scanned"
          aria-valuemin={0}
          aria-valuemax={snapshot.totalPartitions}
          aria-valuenow={snapshot.scannedPartitions}
          aria-valuetext={`${snapshot.scannedPartitions.toLocaleString('en-US')} of ${snapshot.totalPartitions.toLocaleString('en-US')} illustrative partitions scanned`}
        >
          <span style={{ width: `${scanPercent}%` }} />
        </div>
        <div className="english-partition-pruning-lab__scope-scale" aria-hidden="true">
          <span>0</span>
          <span>{snapshot.totalPartitions.toLocaleString('en-US')} total partitions</span>
        </div>
      </div>

      <dl className="english-partition-pruning-lab__metrics" aria-live="polite">
        <div>
          <dt>Partitions skipped</dt>
          <dd>{snapshot.skippedPartitions.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>Fixture scan bytes</dt>
          <dd>{snapshot.scanBytes}</dd>
        </div>
        <div>
          <dt>Fixture files</dt>
          <dd>{snapshot.fileCount.toLocaleString('en-US')}</dd>
        </div>
      </dl>

      <p className="english-partition-pruning-lab__status" role="status" aria-live="polite">
        {explanation}
      </p>
      <p className="english-partition-pruning-lab__note">
        The partition counts, bytes and file counts are illustrative values from a shared teaching
        fixture. They are not measured engine output or a performance benchmark.
      </p>
    </div>
  )
}
