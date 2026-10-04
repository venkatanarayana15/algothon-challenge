import type { AnalysisReport } from '../types'

/**
 * What the pipeline actually did, with the numbers it actually produced.
 *
 * The static explainer further up the page describes how the tool works in
 * general. This describes the run that just happened, in the same five phases,
 * each carrying its measured outcome: how many inputs were tried, which oracle
 * judged them, what disagreed, what survived shrinking, and whether the result
 * killed an injected fault.
 *
 * The distinction matters. A reader who sees "724 inputs tested" can check it
 * against the log; a reader who sees only a prose description has to take our
 * word for it. Every figure here comes from the response, and when a phase did
 * nothing the panel says that instead of implying work happened.
 */
export function PhaseTrace({ report }: { report: AnalysisReport }) {
  const { stats, oracle, mutationScore, minimal, analysisMs } = report

  // `failures` is a free-form record, so a missing key means zero rather than
  // NaN. Reading it defensively matters here: this panel reports the tool's own
  // numbers, and a NaN would be visible to anyone checking.
  const f = stats.failures ?? {}
  const disagreements = (f.wrong ?? 0) + (f.threw ?? 0) + (f.timeout ?? 0)

  const phases = [
    {
      n: '01',
      title: 'Read the code',
      outcome:
        report.params.length > 0
          ? `Found ${report.functionName}(${report.params.map((p) => p.name).join(', ')})`
          : `Found ${report.functionName}`,
      detail:
        'Parameter types and numeric bounds were inferred from the comparisons in your own source, not from configuration.',
    },
    {
      n: '02',
      title: 'Generate biased inputs',
      outcome: `${stats.inputsTested.toLocaleString()} inputs tested`,
      detail: stats.hitBudget
        ? `Searched to the ${stats.timeBudgetMs.toLocaleString()}ms budget rather than exhausting the space. A budget stop is not a proof of absence.`
        : 'The space was exhausted within budget.',
    },
    {
      n: '03',
      title: 'Judge each input',
      outcome: `${oracle.signature} · ${oracle.source} oracle`,
      detail: `${stats.agreements.toLocaleString()} inputs matched the rule. ${disagreements.toLocaleString()} did not.`,
    },
    {
      n: '04',
      title: 'Shrink to the smallest witness',
      outcome: minimal ? minimal.call : 'nothing to shrink',
      detail: minimal
        ? `Delta debugging removed chunks of every failing input until removing any remaining part stopped the failure. The reduced input has ${minimal.size} value${minimal.size === 1 ? '' : 's'}.`
        : 'No failing input was found, so there was nothing to reduce.',
    },
    {
      n: '05',
      title: 'Check the test would catch a real bug',
      outcome: mutationScore
        ? `${mutationScore.killed}/${mutationScore.total} injected faults caught`
        : 'not run',
      detail: mutationScore
        ? mutationScore.killed === mutationScore.total
          ? 'Every injected operator fault was caught, so this input is a real test rather than an accident.'
          : 'Some injected faults survived, so this input is a weaker test than it appears.'
        : 'No mutants were injected for this run.',
    },
  ]

  return (
    <section className="panel-raised overflow-hidden" aria-label="Pipeline phases for this run">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-ink-850/60 px-5 py-3">
        <h3 className="text-sm font-semibold text-white">How this run went, phase by phase</h3>
        <span className="font-mono text-[11px] text-slate-500">
          {typeof analysisMs === 'number' ? `${analysisMs}ms total` : null}
        </span>
      </header>

      <ol className="divide-y divide-white/[0.05]">
        {phases.map((p) => (
          <li key={p.n} className="flex gap-4 px-5 py-3.5">
            <span className="mt-0.5 font-mono text-xs font-semibold text-slate-600">{p.n}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <p className="text-[13px] font-medium text-slate-200">{p.title}</p>
                <code className="break-all font-mono text-[12px] text-rose-300">{p.outcome}</code>
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{p.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}