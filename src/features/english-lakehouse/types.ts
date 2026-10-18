export type EnglishLakehouseScenarioId = 'failed' | 'committed' | 'time-travel'
export type EnglishLakehouseMetadataStatus = 'not-started' | 'uncommitted' | 'committed'
export type EnglishLakehouseCell = string | number | boolean | null

export interface EnglishLakehouseSnapshot {
  version: number
  id: string
  committedAt: string
  columns: string[]
  rows: Array<Record<string, EnglishLakehouseCell>>
}

export interface EnglishLakehouseScenario {
  id: EnglishLakehouseScenarioId
  publishedVersion: number
  queryTargetVersion: number
  readerVersion: number
  metadataStatus: EnglishLakehouseMetadataStatus
  pointerMoved: boolean
  fileBatch: {
    attempted: number
    written: number
    committed: number
  }
}

export interface EnglishLakehouseFixture {
  tableName: string
  fileCount: number
  failureAt: number
  formatExamples: string[]
  snapshots: EnglishLakehouseSnapshot[]
  scenarios: Record<EnglishLakehouseScenarioId, EnglishLakehouseScenario>
}
