import type { AnalysisReport, ApiError, AuditReport, Example } from '../types'

export interface AnalyzeRequest {
  code: string
  functionName?: string
  spec?: string
  oracleCode?: string
  oracleSignature?: string
  seed?: number
  /**
   * Hold a validator to an explicit rule instead of inferring one. Omit it and
   * the engine still recognises most validators from their own shape.
   */
  policy?: { min: number; max: number; integer?: boolean }
}

export class RequestError extends Error {
  kind?: string
  constructor(message: string, kind?: string) {
    super(message)
    this.name = 'RequestError'
    this.kind = kind
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new RequestError(
      'Could not reach the analysis server. It may be restarting — try again in a few seconds.',
      'network',
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new RequestError('The server returned an unreadable response.', 'protocol')
  }

  if (!response.ok) {
    const error = payload as ApiError
    throw new RequestError(error?.error ?? 'The analysis failed.', error?.kind)
  }
  return payload as T
}

export function analyze(request: AnalyzeRequest, signal?: AbortSignal) {
  return post<AnalysisReport>('/api/analyze', request, signal)
}

export async function fetchExamples(signal?: AbortSignal): Promise<Example[]> {
  const response = await fetch('/api/examples', { signal })
  if (!response.ok) throw new RequestError('Could not load examples.', 'network')
  const payload = (await response.json()) as { examples: Example[] }
  return payload.examples
}

export interface EngineHealth {
  ok: boolean
  /** Name of the optional model provider, or null when no key is configured. */
  llm: string | null
  uptimeSeconds: number
  version?: string
}

export async function fetchHealth(signal?: AbortSignal): Promise<EngineHealth> {
  const response = await fetch('/api/health', { signal })
  if (!response.ok) throw new RequestError('unhealthy', 'network')
  return (await response.json()) as EngineHealth
}

/**
 * The full ALG-CYBER-02 workflow: audit the deliberately vulnerable
 * application, fix each finding, retest. Takes several seconds because it
 * genuinely runs the analysis, the fixes and the regression suite.
 */
export async function fetchAudit(signal?: AbortSignal): Promise<AuditReport> {
  const response = await fetch('/api/audit', { signal })
  if (!response.ok) throw new RequestError('Could not run the audit.', 'network')
  return (await response.json()) as AuditReport
}

/**
 * The audit's findings as a runnable `node:test` file, generated server-side from
 * the same audit report the panel renders -- so the download cannot disagree with
 * what is on screen.
 */
export async function fetchRegressionTest(signal?: AbortSignal): Promise<{
  filename: string
  contents: string
  runs: number
}> {
  const response = await fetch('/api/audit/regression-test', { signal })
  if (!response.ok) throw new RequestError('Could not generate the regression test.', 'network')
  return (await response.json()) as { filename: string; contents: string; runs: number }
}

export interface BenchmarkRow {
  id: string
  expect: 'bug' | 'correct'
  truth: string
  predicted: string
  found: boolean
  correctPrediction: boolean
  counterexample: string | null
  kind: string | null
}

export interface BenchmarkPayload {
  summary: {
    totalCases: number
    bugCases: number
    controlCases: number
    detectionRate: number
    falsePositiveRate: number
    classAccuracy: number
    missed: string[]
    falsePositives: string[]
    byClass: Array<{ class: string; total: number; detected: number; named: number; detectionRate: number }>
  }
  classes: Record<string, string>
  rows: BenchmarkRow[]
}

/**
 * One slice of the live benchmark. The suite is paged because a full run
 * takes over a minute -- short requests stay alive on hosted tiers and the
 * table can fill in progressively instead of going quiet.
 */
export async function fetchBenchmarkChunk(
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<{ offset: number; limit: number; total: number; done: boolean; rows: BenchmarkRow[] }> {
  let response: Response
  try {
    response = await fetch(`/api/benchmark?offset=${offset}&limit=${limit}`, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new RequestError('Could not reach the analysis server.', 'network')
  }
  if (!response.ok) throw new RequestError('That benchmark chunk failed.', 'internal')
  return (await response.json()) as {
    offset: number
    limit: number
    total: number
    done: boolean
    rows: BenchmarkRow[]
  }
}

/** Aggregate measured rows into the summary the matrix renders. */
export function summarizeBenchmark(rows: BenchmarkRow[], signal?: AbortSignal) {
  return post<BenchmarkPayload>('/api/benchmark/summarize', { rows }, signal)
}