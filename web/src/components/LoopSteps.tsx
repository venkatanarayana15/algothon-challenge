interface Props {
  /** A report exists for the current code. */
  found: boolean
  /** A run is in flight. */
  running: boolean
  /** An automatic fix is offered for the current report. */
  fixOffered: boolean
  /** The guard is currently applied. */
  fixed: boolean
  /** The guarded code retested clean. */
  verified: boolean
}

/**
 * Where you are in the loop.
 *
 * Analyse → fix → retest is a journey, and nothing on screen said which leg
 * you were on. Each state here is derived from what the app actually holds,
 * not from a timer: a step is done when its evidence exists. When no
 * automatic fix applies, the middle step says so instead of implying a fix is
 * waiting.
 */
export function LoopSteps({ found, running, fixOffered, fixed, verified }: Props) {
  const steps = [
    {
      label: 'Find',
      detail: 'the breaking input',
      state: found || running ? (running && !found ? 'active' : 'done') : 'todo',
    },
    {
      label: 'Fix',
      detail: fixOffered ? 'the guard' : found ? 'no automatic fix' : 'the guard',
      state: fixed ? 'done' : found && !fixOffered ? 'skipped' : found ? 'active' : 'todo',
    },
    {
      label: 'Verify',
      detail: 'the retest',
      state: verified ? 'done' : fixed ? (running ? 'active' : 'todo') : 'todo',
    },
  ] as const

  return (
    <ol aria-label="Progress" className="flex items-center gap-1.5">
      {steps.map((step, i) => (
        <li key={step.label} className="flex min-w-0 flex-1 items-center gap-1.5 last:flex-none">
          <span
            className={`flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              step.state === 'done'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : step.state === 'active'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                  : step.state === 'skipped'
                    ? 'border-white/[0.06] bg-white/[0.02] text-slate-600'
                    : 'border-white/[0.06] bg-white/[0.02] text-slate-500'
            }`}
          >
            {step.state === 'done' ? (
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : step.state === 'active' ? (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            ) : (
              <span className="font-mono">{i + 1}</span>
            )}
            {step.label}
          </span>
          <span className="hidden truncate text-[11px] text-slate-600 sm:inline">{step.detail}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px min-w-3 flex-1 bg-white/[0.08]" />}
        </li>
      ))}
    </ol>
  )
}