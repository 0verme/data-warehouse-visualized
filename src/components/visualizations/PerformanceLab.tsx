import type { PerformanceVisualization } from '../../features/performance/types'
import { PerformanceDiagnosisLab } from './PerformanceDiagnosisLab'
import { PerformanceScanLab } from './PerformanceScanLab'
import { PerformanceSkewLab } from './PerformanceSkewLab'
import { PerformanceStateLab } from './PerformanceStateLab'
import { PerformanceTradeoffLab } from './PerformanceTradeoffLab'

export function PerformanceLab({ visualization }: { visualization: PerformanceVisualization }) {
  switch (visualization.focus) {
    case 'diagnosis':
      return <PerformanceDiagnosisLab visualization={visualization} />
    case 'scan-layout':
      return <PerformanceScanLab visualization={visualization} />
    case 'shuffle-skew':
      return <PerformanceSkewLab visualization={visualization} />
    case 'first-seen':
      return <PerformanceStateLab visualization={visualization} />
    case 'tradeoffs':
      return <PerformanceTradeoffLab visualization={visualization} />
  }
}

export {
  PerformanceDiagnosisLab,
  PerformanceScanLab,
  PerformanceSkewLab,
  PerformanceStateLab,
  PerformanceTradeoffLab,
}
