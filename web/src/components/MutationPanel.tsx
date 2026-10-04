import type { MutationScore } from '../types'

interface Props {
  score: MutationScore | null
}

/**
 * Proof, not decoration. We mutate the submission with six classic operator
 * faults and check whether the reported counterexample actually catches each
 * one. A counterexample that kills nothing would be a bad test, and saying so
 * honestly is the difference between a tool and a party trick.
 */
export function MutationPanel({ score }: Props) {
  if (!score || score.total === 0) return null

  const pct = Math.round(score.ratio * 100)
  const complete = score.killed === score.total
  const tone = complete
    ? { text: 'text-emerald-400', bar: 'bg-emerald-500', ring: 'stroke-emerald-500/20' }
    : { text: 'text-amber-400', bar: 'bg-amber-500', ring: 'stroke-amber-500/20' }

  return (
    <section className="panel animate-fade-up p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Did this input actually catch the bug?</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            We injected six classic operator faults into your code and checked whether this
            counterexample detects each one. A counterexample that kills nothing is not a test.
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div className={`font-mono text-2xl font-semibold ${tone.text}`}>
            {score.killed}
            <span className="text-slate-600">/{score.total}</span>
          </div>
          <div className="label mt-0.5">mutants killed</div>
        </div>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${tone.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {score.results.map((result) => (
          <li
            key={result.id}
            className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-white/[0.05] bg-ink-950/40 px-3 py-2"
          >
            {/* min-w-0 is load-bearing: a flex item defaults to min-width:auto,
                which would make `truncate` (white-space:nowrap) report the whole
                label as its minimum and push the page wider than the phone. */}
            <code className="min-w-0 truncate font-mono text-[11px] text-slate-400">{result.label}</code>
            <span
              className={`chip shrink-0 ${
                result.killed
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/[0.06] bg-white/[0.02] text-slate-600'
              }`}
            >
              {result.killed ? 'killed' : 'survived'}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        {complete ? (
          <>
            All {score.total} injected faults are detected by this input.{' '}
            <span className="text-slate-600">
              That is the strongest signal we can give that the counterexample is genuinely
              exercising your logic.
            </span>
          </>
        ) : (
          <>
            {score.total - score.killed} injected{' '}
            {score.total - score.killed === 1 ? 'fault survives' : 'faults survive'} this input,
            which means the bug is narrower than a single condition. Worth a second look.
          </>
        )}
      </p>
    </section>
  )
}