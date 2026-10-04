import benchmark from '../data/benchmark.json'
import { CLASS_ADVICE } from '../lib/advice'

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
  const { summary, classes } = benchmark as unknown as BenchmarkData
  const matrix = summary.byClass

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