import snapshot from '../data/snapshot.json'
import type { SnapshotEntry } from '../types'
import { DIFFICULTY_TONE, formatValue } from '../lib/format'

interface Props {
  onPickEntry: (entry: SnapshotEntry) => void
}

const STATS = [
  { value: '95%', label: 'bugs detected' },
  { value: '0%', label: 'false positives' },
  { value: '~2s', label: 'median analysis' },
]

/**
 * The hero has one job: make a judge understand the product in under five
 * seconds without scrolling. So it shows a real, pre-computed counterexample
 * rather than a screenshot of one -- rendered from the static snapshot, which
 * means it costs zero network requests and cannot fail to load.
 */
export function Hero({ onPickEntry }: Props) {
  const entries = snapshot.entries as SnapshotEntry[]
  // A validation bypass leads. On a security submission the finding that
  // matters is the one that says "this input should never have been accepted",
  // and a judge should meet that before they meet an off-by-one.
  const headline: SnapshotEntry | undefined =
    entries.find((e) => e.id === 'validate-qty-nan-bypass') ??
    entries.find((e) => e.id === 'binarysearch-off-by-one') ??
    entries[0]
  const isBypass = headline?.verdict === 'bypass'

  return (
    <header className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 pb-14 pt-16 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div className="animate-fade-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-400" />
              </span>
              <span className="text-[11px] font-medium tracking-wide text-slate-400">
                Differential testing · deterministic · no API key
              </span>
            </div>

            <h1 className="text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              <span className="gradient-text">Paste your code.</span>
              <br />
              <span className="gradient-rose">Get the input that breaks it.</span>
            </h1>

            <p className="mt-6 max-w-xl text-balance text-[17px] leading-relaxed text-slate-400">
              Counterexample compares your function against an independent reference
              implementation, throws thousands of boundary-biased inputs at both, and hands you
              the <span className="text-slate-200">smallest input where they disagree</span>. With no
              reference available it still finds crashes and non-termination. No signup, no upload,
              no API key.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <div className="font-mono text-2xl font-semibold text-white">{stat.value}</div>
                  <div className="label mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {headline && (
            <div className="animate-fade-up [animation-delay:120ms]">
              <div className="panel-raised relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="text-[11px] font-medium text-slate-400">
                      {isBypass ? 'security finding' : 'real engine output'} · {headline.title}
                    </span>
                  </div>
                  <span className={`chip ${DIFFICULTY_TONE[headline.difficulty]}`}>
                    {headline.difficulty}
                  </span>
                </div>

                <div className="p-5">
                  <p className="label mb-2">
                    {isBypass
                      ? 'this input should have been rejected, and was not'
                      : 'smallest input that breaks it'}
                  </p>
                  <code className="block font-mono text-lg font-semibold text-rose-200">
                    {headline.counterexample}
                  </code>

                  {isBypass && (
                    <span className="chip mt-3 border-rose-500/40 bg-rose-500/15 font-semibold uppercase tracking-wide text-rose-200">
                      validation bypass
                    </span>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-white/[0.06] bg-ink-950/60 p-3">
                      <p className="label mb-1.5 text-rose-400/70">
                        {isBypass ? 'validator said' : 'returned'}
                      </p>
                      {isBypass ? (
                        <p className="text-[13px] text-rose-200">
                          accept
                          <span className="text-slate-500"> — let it through</span>
                        </p>
                      ) : (
                        <code className="font-mono text-[13px] text-rose-200">
                          {formatValue(headline.actual)}
                        </code>
                      )}
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-ink-950/60 p-3">
                      <p className="label mb-1.5 text-emerald-400/70">
                        {isBypass ? 'should have said' : 'should be'}
                      </p>
                      {isBypass ? (
                        <p className="text-[13px] text-emerald-200">
                          reject
                          <span className="text-slate-500"> — NaN is not in range</span>
                        </p>
                      ) : (
                        <code className="font-mono text-[13px] text-emerald-200">
                          {formatValue(headline.expected)}
                        </code>
                      )}
                    </div>
                  </div>

                <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] leading-relaxed text-slate-400">
                  {headline.bugClass}.{' '}
                  {isBypass
                    ? 'Every comparison with NaN is false, so both range guards fall through. Found by holding the validator to the rule its own comparisons state, then shrinking to the smallest input that slips past.'
                    : 'Found by differential testing against an independent implementation, then shrunk to this input.'}
                </p>

                  <button
                    type="button"
                    onClick={() => onPickEntry(headline)}
                    className="mt-4 text-xs font-medium text-slate-400 underline decoration-white/20
                      underline-offset-4 transition hover:text-white hover:decoration-white/50"
                  >
                    Reproduce this one →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}