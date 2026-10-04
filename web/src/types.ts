export type FindingKind = 'wrong-answer' | 'threw' | 'timeout' | 'nondeterministic'

export interface InferredParam {
  index: number
  name: string
  type: 'number' | 'string' | 'boolean' | 'array' | 'object' | 'sequence' | 'unknown'
  ambiguous?: boolean
  source?: string
  element?: { type: string }
  min?: number
  max?: number
}

export interface Finding {
  kind: FindingKind
  call: string
  originalCall?: string
  args: unknown[]
  expected?: unknown
  actual?: unknown
  error?: string
  errorMessage?: string
  second?: unknown
  reduction?: number
  /**
   * Present when the subject is a validator rather than a value-returning
   * function. A bypass is the severe direction: the subject accepted an input
   * the policy rejects.
   */
  verdict?: 'bypass' | 'false-rejection'
  subjectValue?: unknown
}

export interface MutationResult {
  id: string
  label: string
  killed: boolean
}

export interface MutationScore {
  results: MutationResult[]
  killed: number
  total: number
  ratio: number
}

export interface Explanation {
  summary: string
  detail: string
  patch?: string
  confidence: 'model' | 'heuristic'
}

export interface AnalysisReport {
  status: 'counterexample-found' | 'no-counterexample-found' | 'oracle-missing'
  functionName: string
  params: InferredParam[]
  oracle: {
    signature: string
    summary: string
    source: 'library' | 'model' | 'user' | 'none' | 'policy' | 'policy-preset'
    code: string
  }
  baseline: { status: string; value?: unknown; error?: string }
  stats: {
    inputsTested: number
    agreements: number
    timeBudgetMs: number
    hitBudget: boolean
    failures: Record<string, number>
  }
  finding: Finding | null
  minimal: { call: string; args: unknown[]; size: number } | null
  bugClass?: string | null
  advice?: string | null
  mutationScore: MutationScore | null
  explanation: Explanation | null
  logs?: string[]
  analysisMs: number
  message?: string
}

export interface Example {
  id: string
  title: string
  difficulty: string
  language: string
  oracleSignature: string
  spec: string
  tags: string[]
  bugClass: string
  code: string
  counterexample: string
  rootCause: string
  fix: string
}

export interface SnapshotEntry {
  id: string
  title: string
  difficulty: string
  language: string
  spec: string
  tags: string[]
  bugClass: string
  code: string
  rootCause: string
  fix: string
  provenance: boolean
  counterexample: string
  kind: FindingKind
  expected: unknown
  actual: unknown
  mutationScore: { killed: number; total: number; ratio: number } | null
  params: { name: string; type: string; ambiguous: boolean }[]
}

export interface Snapshot {
  totalExamples: number
  entries: SnapshotEntry[]
}

export interface ApiError {
  error: string
  kind?: string
}