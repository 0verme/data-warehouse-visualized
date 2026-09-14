import { CompareSplit, type CompareSplitProps } from './CompareSplit'

/** @deprecated Use CompareSplit for new lesson sections. */
export function CompareCard(props: CompareSplitProps) {
  return <CompareSplit {...props} />
}

export type { CompareSplitProps as CompareCardProps }
