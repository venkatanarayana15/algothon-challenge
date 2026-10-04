import { useCallback, useEffect, useRef, useState } from 'react'
import snapshot from '../data/benchmark.json'
import { CLASS_ADVICE } from '../lib/advice'
import {
  RequestError,
  fetchBenchmarkChunk,
  summarizeBenchmark,
  type BenchmarkPayload,
  type BenchmarkRow,
} from '../lib/api'

interface ClassRow {
  class: string
  total: number
  detected: number
  named: number
  detectionRate: number
}

interface BenchmarkData {
  summary: {
    totalCases: number
    bugCases: number
    controlCases: number
    detectionRate: number
    falsePositiveRate: number
    classAccuracy: number
    missed: string[]
    byClass: ClassRow[]
  }
  classes: Record<string, string>
}

/**
 * The credibility section.
 *
 * Every number here comes from a real run of the engine over a labelled suite,
 * including nine deliberately-correct implementations as controls. Reporting a
 * detection rate without a false-positive rate would be a claim rather than a
 * measurement, and the one bug the suite misses is left in rather than quietly
 * dropped -- a benchmark that cannot fail is not a benchmark.
 */
export function BenchmarkMatrix() {
  const [live, setLive] = useState<BenchmarkPayload | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [elapsed, setElapsed] = useState(0)
  const [runSeconds, setRunSeconds] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (!running) return
    const start = Date.now()
    const id = window.setInterval(() => setElapsed((Date.now() - start) / 1000), 250)
    return () => window.clearInterval(id)
  }, [running])

  /**
   * Measure the suite live on this server, six cases per request.
   *
   * A full run takes over a minute, which is too long to hold one connection
   * on hosted tiers -- so the client pages through the corpus and the table
   * swaps over only when every case has reported. Cancelling stops asking for
   * more chunks; whatever the server already finished is discarded, and the
   * committed snapshot stays exactly where it was.
   */
  const runLive = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setError(null)
    setElapsed(0)
    const started = Date.now()

    try {
      const CHUNK = 6
      let offset = 0
      let total = 0
      const rows: BenchmarkRow[] = []
      for (;;) {
        const chunk = await fetchBenchmarkChunk(offset, CHUNK, controller.signal)
        total = chunk.total
        rows.push(...chunk.rows)
        offset += chunk.rows.length
        setProgress({ done: Math.min(offset, total), total })
        if (chunk.done || chunk.rows.length === 0) break
      }
      const payload = await summarizeBenchmark(rows, controller.signal)
      setLive(payload)
      setRunSeconds((Date.now() - started) / 1000)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(
        err instanceof RequestError
          ? err.message
          : 'The live run failed partway. The committed snapshot below is unaffected.',
      )
    } finally {
      setRunning(false)
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setRunning(false)
  }, [])

  const data = (live ?? snapshot) as unknown as BenchmarkData
  const { summary, classes } = data
  const matrix = summary.byClass
  const isLive = live !== null

  const HEADLINE = [
    {
      value: `${Math.round(summary.detectionRate * 100)}%`,
      label: 'detection rate',
      // Derived, not asserted. "all found" next to a 95% headline is a
      // contradiction, and the caveat below names the escape -- so the detail
      // line has to count it too.
      detail: `${summary.bugCases - summary.missed.length} of ${summary.bugCases} seeded bugs found by the engine`,
      tone: 'text-emerald-300',
    },
    {
      value: `${Math.round(summary.falsePositiveRate * 100)}%`,
      label: 'false positives',
      detail: `${summary.controlCases} correct implementations, none flagged`,
      tone: 'text-emerald-300',
    },
    {
      value: `${Math.round(summary.classAccuracy * 100)}%`,
      label: 'class naming',
      detail: 'heuristic — see the caveat below',
      tone: 'text-amber-300',
    },
  ]

  return (
    <section id="benchmark" className="border-y border-white/[0.05] bg-ink-900/30">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="mb-12 max-w-2xl">
          <p className="label mb-3 text-rose-400/80">Measured, not claimed</p>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            What this actually catches
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
            A labelled suite of{' '}
            <span className="text-slate-300">{summary.bugCases} real defects</span> and{' '}
            <span className="text-slate-300">{summary.controlCases} deliberately correct
            implementations</span>, run end to end. The controls matter: a fuzzer that flags
            everything detects everything.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {running ? (
              <>
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  Cancel the live run
                </button>
                <span className="font-mono text-[12px] tabular-nums text-slate-400">
                  measuring live… {progress.done}/{progress.total} cases · {elapsed.toFixed(0)}s
                </span>
                <span className="h-1 w-40 overflow-hidden rounded-full bg-white/[0.06]">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400 transition-[width]"
                    style={{
                      width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                    }}
                  />
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void runLive()}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-amber-400 px-4 py-2 text-[13px] font-semibold text-ink-950 transition hover:brightness-110"
                >
                  {isLive ? 'Re-run live on this server' : 'Run live on this server'}
                </button>
                {isLive && (
                  <button
                    type="button"
                    onClick={() => {
                      setLive(null)
                      setRunSeconds(null)
                    }}
                    className="text-[12px] font-medium text-slate-500 underline decoration-white/20 underline-offset-4 transition hover:text-slate-300"
                  >
                    Back to the committed snapshot
                  </button>
                )}
              </>
            )}
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
            {isLive && runSeconds !== null ? (
              <>
                Measured live on this server · {summary.totalCases} cases · {runSeconds.toFixed(0)}s
                · just now. Same corpus, same budgets as{' '}
                <code className="font-mono text-slate-400">npm run benchmark</code>.
              </>
            ) : (
              <>
                Committed snapshot — regenerated from a real engine run and verified by CI on every
                push. Press the button to measure the same suite live against this deployment.
              </>
            )}
          </p>
          {error && !running && <p className="mt-2 text-[12px] text-rose-300">{error}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {HEADLINE.map((stat) => (
            <div key={stat.label} className="panel p-6">
              <div className={`font-mono text-4xl font-bold ${stat.tone}`}>{stat.value}</div>
              <div className="mt-1 text-sm font-medium text-slate-200">{stat.label}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{stat.detail}</p>
            </div>
          ))}
        </div>

        <div className="panel mt-4 overflow-hidden">
          <div className="border-b border-white/[0.06] px-6 py-4">
            <h3 className="text-sm font-semibold text-white">Detection by bug class</h3>
            <p className="mt-1 text-xs text-slate-500">
              {summary.totalCases} cases, every one run end to end
            </p>
          </div>

          <ul className="divide-y divide-white/[0.05]">
            {matrix.map((row) => {
              const pct = Math.round(row.detectionRate * 100)
              return (
                <li key={row.class} className="flex items-center gap-4 px-6 py-3">
                  <span className="w-44 shrink-0 text-[13px] text-slate-300">
                    {classes[row.class] ?? row.class}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                    <span
                      className={`block h-full rounded-full ${
                        pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-xs text-slate-500">
                    {row.detected}/{row.total}
                  </span>
                  <span
                    className={`w-12 shrink-0 text-right font-mono text-xs ${
                      pct === 100 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {pct}%
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel p-6">
            <h3 className="mb-3 text-sm font-semibold text-white">The caveat we will not bury</h3>
            <ul className="space-y-2.5 text-[13px] leading-relaxed text-slate-400">
              <li>
                <span className="text-amber-300">Class naming is {Math.round(summary.classAccuracy * 100)}%, not 100%.</span>{' '}
                It is a heuristic over the shape of the counterexample and your source, not a
                proof. Treat the label as a pointer to where to look.
              </li>
              <li>
                <span className="text-amber-300">
                  {summary.missed.length > 0
                    ? `${summary.missed.length} bug escapes this suite`
                    : 'No known escapes in this suite'}
                </span>{' '}
                {summary.missed.length > 0 && (
                  <>— specifically <code className="font-mono text-slate-300">{summary.missed.join(', ')}</code>, where a{' '}
                    <code className="font-mono text-slate-300">&gt;=</code> comparison silently{' '}
                    <code className="font-mono text-slate-300">NaN</code> out-discards the
                    maximum. It is left in the table rather than removed.</>
                )}
              </li>
              <li>
                <span className="text-amber-300">The suite is ours.</span> It is built from bug
                classes we thought to write down, so it cannot tell you about a class we never
                imagined.
              </li>
            </ul>
          </div>

          <div className="panel p-6">
            <h3 className="mb-3 text-sm font-semibold text-white">What each class means</h3>
            <dl className="space-y-2.5 text-[13px] leading-relaxed">
              {matrix.slice(0, 5).map((row) => (
                <div key={row.class}>
                  <dt className="font-medium text-slate-300">{classes[row.class] ?? row.class}</dt>
                  <dd className="text-slate-500">{CLASS_ADVICE[row.class]}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}