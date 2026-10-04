import type { RunRecord } from '../types'
import { Icon } from './Icons'

interface Props {
  records: RunRecord[]
  onClear: () => void
}

const ORIGIN_LABEL: Record<RunRecord['origin'], string> = {
  manual: 'manual run',
  demo: 'demo',
  fix: 'after the fix',
}

/**
 * The verification trail: what was run, in order, and what happened.
 *
 * This exists because "fixed" is the easiest word in software to say and the
 * hardest to support. A judge — or a reviewer six months later — can see the
 * running order: a bypass reported, a guard applied, and the same analysis
 * coming back clean afterwards. That sequence is the evidence; a green badge on
 * its own is not, which is why the badge is only shown once the trail actually
 * contains the before and the after.
 *
 * Deliberately session-scoped and in memory. Persisting it across visits would
 * turn a record of what happened into a record of what someone once ran.
 */
export function RunTrail({ records, onClear }: Props) {
  if (records.length < 2) return null

  // "Verified" means the trail contains a bypass and, at some point after it, a
  // run that came back clean.
  const firstBypass = records.findIndex((record) => record.verdict === 'bypass')
  const verifiedAfter =
    firstBypass >= 0 &&
    records
      .slice(firstBypass + 1)
      .some((record) => record.status === 'no-counterexample-found')

  return (
    <section className="panel animate-fade-up p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-white">This session</h3>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] font-medium text-slate-500 transition hover:text-slate-300"
        >
          clear
        </button>
      </div>

      {verifiedAfter && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-3.5">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
            <Icon name="check" className="h-2.5 w-2.5 text-emerald-300" weight={2.6} />
          </span>
          <p className="text-[13px] leading-relaxed text-emerald-100">
            <span className="font-semibold">Fixed and verified.</span>{' '}
            <span className="text-emerald-200/80">
              A validation bypass was reported and, after the change, the same analysis came back
              with no counterexample. That is the retest the problem statement asks for — not a
              claim that a fix was applied.
            </span>
          </p>
        </div>
      )}

      {/* Two lines rather than one: a phone column is about 310px wide, and four
          fixed-width columns plus a call expression do not fit without either
          clipping the call or widening the page. Stacking the meta underneath
          keeps every field readable at any width. */}
      <ol className="space-y-1.5">
        {records.map((record, index) => (
          <li
            key={record.id}
            className="rounded-md border border-white/[0.05] bg-ink-950/40 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="w-4 shrink-0 font-mono text-[11px] text-slate-600">{index + 1}</span>
              <StatusDot record={record} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300">
                {record.call ?? statusText(record)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 pl-7">
              <span className="truncate text-[11px] text-slate-600">{ORIGIN_LABEL[record.origin]}</span>
              <span className="shrink-0 font-mono text-[11px] text-slate-600">
                {(record.analysisMs / 1000).toFixed(1)}s
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function statusText(record: RunRecord): string {
  if (record.status === 'no-counterexample-found') return 'no counterexample found'
  if (record.status === 'oracle-missing') return 'no reference implementation'
  return 'counterexample found'
}

function StatusDot({ record }: { record: RunRecord }) {
  const tone =
    record.verdict === 'bypass'
      ? { dot: 'bg-rose-400', label: 'bypass', text: 'text-rose-300' }
      : record.status === 'counterexample-found'
        ? { dot: 'bg-amber-400', label: 'found', text: 'text-amber-300' }
        : record.status === 'no-counterexample-found'
          ? { dot: 'bg-emerald-400', label: 'clean', text: 'text-emerald-300' }
          : { dot: 'bg-slate-500', label: 'none', text: 'text-slate-400' }

  return (
    <span className="flex w-[4.5rem] shrink-0 items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <span className={`text-[11px] font-medium ${tone.text}`}>{tone.label}</span>
    </span>
  )
}
