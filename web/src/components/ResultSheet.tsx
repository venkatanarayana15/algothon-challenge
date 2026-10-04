import { useEffect, useRef } from 'react'
import type { AnalysisReport } from '../types'

interface Props {
  report: AnalysisReport
  onClose: () => void
  /** Applies the generated fix and closes the sheet. */
  onApplyFix: () => void
  /** Moves focus to the full result in the page, for detail. */
  onSeeDetail: () => void
  /** Reports the fix as already applied, so the sheet does not offer it twice. */
  fixApplied: boolean
  /**
   * The proposed change, when one applies.
   *
   * Only a bypass whose parameter the engine confirmed lacks a finiteness check
   * gets a guard. Anything else is null and the sheet says so, rather than
   * offering a fix derived from a guess.
   */
  fix: { guard: string; reason: string } | null
}

/**
 * The answer, in a sheet.
 *
 * Clicking Analyse used to scroll the page and drop the result into a column
 * that might be off-screen or below the fold, so the person who asked the
 * question had to go looking for the answer. This puts the finding where the
 * click happened.
 *
 * It answers in the order the question gets asked: here is the input, here is
 * what your code did with it, here is what it should have done, here is why,
 * and here is the change. The full report stays in the page -- this is the
 * short version, not a replacement, and there is a route to the long one.
 *
 * Real dialog semantics, because a sheet that leaks focus behind it is worse
 * than no sheet: Escape closes, focus is trapped while open and restored on
 * close, and the backdrop is inert to clicks apart from the close path.
 */
export function ResultSheet({
  report,
  onClose,
  onApplyFix,
  onSeeDetail,
  fixApplied,
  fix,
}: Props) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return

      // Keep Tab inside the sheet. Without this, focus walks to the page behind
      // and the reader loses track of what the sheet is covering.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const finding = report.finding
  const minimal = report.minimal
  const clean = report.status === 'no-counterexample-found'
  const noOracle = report.status === 'oracle-missing'

  const headline = clean
    ? 'No breaking input found'
    : noOracle
      ? 'No reference to judge against'
      : 'Found it'
  const sub = clean
    ? 'Nothing we tried made this function contradict the rule it was given. That is not proof it is correct — only that this search did not defeat it.'
    : noOracle
      ? 'With no reference implementation or policy, the engine can only detect crashes and non-termination, not wrong answers.'
      : 'One input makes your function disagree with the rule it was written to enforce.'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-sheet-title"
        tabIndex={-1}
        className="panel-raised max-h-[85vh] w-full max-w-xl overflow-y-auto"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] bg-ink-850/60 px-5 py-4">
          <div className="min-w-0">
            <p className="label mb-1.5">analysis result</p>
            <h2 id="result-sheet-title" className="text-base font-semibold text-white">
              {headline}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{sub}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {minimal && (
            <div>
              <p className="label mb-2">the input</p>
              <code className="block break-words rounded-lg border border-rose-500/20 bg-rose-500/[0.05] px-3.5 py-2.5 font-mono text-[13px] text-rose-200">
                {minimal.call}
              </code>
            </div>
          )}

          {finding && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.05] p-3">
                <p className="label mb-1 text-rose-400/70">your code does</p>
                <p className="font-mono text-[13px] text-rose-200">
                  {finding.errorMessage ?? String(finding.actual)}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
                <p className="label mb-1 text-emerald-400/70">it should have done</p>
                <p className="font-mono text-[13px] text-emerald-200">{String(finding.expected)}</p>
              </div>
            </div>
          )}

          {report.explanation?.detail && (
            <div>
              <p className="label mb-1.5">why</p>
              <p className="text-[13px] leading-relaxed text-slate-300">{report.explanation.detail}</p>
            </div>
          )}

          {fix && (
            <div>
              <p className="label mb-1.5">the fix</p>
              <pre className="max-h-32 overflow-auto rounded-lg border border-white/[0.06] bg-ink-900/70 px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-emerald-200">
                {fix.guard}
              </pre>
              <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{fix.reason}</p>
            </div>
          )}

          {!fix && !clean && !noOracle && (
            <p className="text-[12px] leading-relaxed text-slate-500">
              No automatic fix is offered here. The tool only proposes a guard when it has confirmed
              which check is missing, and it says so when it does not know.
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-slate-600">
            {report.stats.inputsTested.toLocaleString()} inputs tested ·{' '}
            {typeof report.analysisMs === 'number' ? `${report.analysisMs}ms` : null}
            {report.mutationScore
              ? ` · ${report.mutationScore.killed}/${report.mutationScore.total} injected faults caught`
              : null}
          </p>
        </div>

        <footer className="flex flex-wrap items-center gap-2.5 border-t border-white/[0.06] px-5 py-3.5">
          {fix && !fixApplied && (
            <button
              type="button"
              onClick={onApplyFix}
              className="rounded-lg bg-gradient-to-r from-rose-500 to-amber-400 px-4 py-2 text-[13px] font-semibold text-ink-950 transition hover:brightness-110"
            >
              Apply the fix
            </button>
          )}
          {fixApplied && (
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-medium text-emerald-300">
              Fix applied — retest to confirm
            </span>
          )}
          <button
            type="button"
            onClick={onSeeDetail}
            className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            See full report
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-2 py-2 text-[13px] text-slate-500 transition hover:text-slate-300"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}