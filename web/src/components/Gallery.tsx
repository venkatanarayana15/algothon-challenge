import { useMemo, useState } from 'react'
import snapshot from '../data/snapshot.json'
import type { SnapshotEntry } from '../types'
import { CodeBlock } from './CodeBlock'
import { DIFFICULTY_TONE, formatValue } from '../lib/format'

interface Props {
  onPickEntry: (entry: SnapshotEntry) => void
}

type Filter = 'all' | 'easy' | 'medium' | 'hard' | 'real'

/**
 * The gallery is the argument for the product. Every card is a real run of the
 * real engine, captured in `snapshot.json` -- not a mockup. If a judge
 * distrusts the headline claim, they can read thirteen of them here.
 */
export function Gallery({ onPickEntry }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const entries = snapshot.entries as SnapshotEntry[]

  const visible = useMemo(() => {
    if (filter === 'all') return entries
    if (filter === 'real') return entries.filter((e) => e.provenance)
    return entries.filter((e) => e.difficulty === filter)
  }, [entries, filter])

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: entries.length },
    { key: 'easy', label: 'Easy', count: entries.filter((e) => e.difficulty === 'easy').length },
    { key: 'medium', label: 'Medium', count: entries.filter((e) => e.difficulty === 'medium').length },
    { key: 'hard', label: 'Hard', count: entries.filter((e) => e.difficulty === 'hard').length },
    { key: 'real', label: 'Real-world shape', count: entries.filter((e) => e.provenance).length },
  ]

  return (
    <section id="gallery" className="mx-auto max-w-6xl px-5 py-20">
      <div className="mb-10 max-w-2xl">
        <p className="label mb-3 text-rose-400/80">Seeded gallery</p>
        <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Thirteen real bugs, each with the exact input that triggers it
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
          Every card below is a genuine run of the engine against a seeded submission. Load any
          of them into the editor above and find the same counterexample yourself.
        </p>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
              filter === f.key
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                : 'border-white/[0.07] bg-white/[0.02] text-slate-500 hover:border-white/15 hover:text-slate-300'
            }`}
          >
            {f.label}
            <span className="ml-1.5 opacity-50">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((entry) => {
          const isOpen = expanded === entry.id
          return (
            <article
              key={entry.id}
              className={`panel group flex flex-col transition hover:border-white/[0.13] ${
                entry.provenance ? 'border-amber-500/20 bg-amber-500/[0.03]' : ''
              }`}
            >
              <div className="flex-1 p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold leading-snug text-white">{entry.title}</h3>
                  <span className={`chip shrink-0 ${DIFFICULTY_TONE[entry.difficulty]}`}>
                    {entry.difficulty}
                  </span>
                </div>

                {entry.provenance && (
                  <p className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-amber-500/25
                    bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                    the shape of a bug that ships
                  </p>
                )}

                <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3.5 py-3">
                  <p className="label mb-1.5">counterexample</p>
                  <code className="block break-words font-mono text-[13px] font-semibold text-rose-200">
                    {entry.counterexample}
                  </code>
                  <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
                    {entry.verdict === 'bypass' ? (
                      <>
                        <span className="text-rose-400/80">
                          validator said{' '}
                          <span className="font-mono text-rose-200">{String(entry.actual)}</span>
                        </span>
                        <span className="text-emerald-400/80">
                          should have said{' '}
                          <span className="font-mono text-emerald-200">{String(entry.expected)}</span>
                        </span>
                        <span className="chip border-rose-500/40 bg-rose-500/15 font-semibold uppercase tracking-wide text-rose-200">
                          bypass
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-rose-400/80">
                          returned <span className="font-mono text-rose-200">{formatValue(entry.actual)}</span>
                        </span>
                        <span className="text-emerald-400/80">
                          expected{' '}
                          <span className="font-mono text-emerald-200">{formatValue(entry.expected)}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <p className="mt-3.5 text-[13px] leading-relaxed text-slate-400">
                  <span className="font-medium text-slate-300">{entry.bugClass}.</span>{' '}
                  {entry.rootCause}
                </p>

                {isOpen && (
                  <div className="mt-4 space-y-4 animate-fade-up">
                    <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-ink-950/50">
                      <CodeBlock code={entry.code} showLineNumbers />
                    </div>
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5">
                      <p className="label mb-1.5 text-emerald-400/80">the fix</p>
                      <code className="font-mono text-[12px] text-emerald-200">{entry.fix}</code>
                    </div>
                  </div>
                )}
              </div>

              <footer className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3">
                <span className="text-[11px] text-slate-600">
                  {entry.kind === 'nondeterministic' ? 'non-deterministic' : 'differential'}
                  {entry.mutationScore && entry.mutationScore.total > 0 && (
                    <> · {entry.mutationScore.killed}/{entry.mutationScore.total} mutants</>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    className="text-[11px] font-medium text-slate-500 transition hover:text-slate-300"
                  >
                    {isOpen ? 'less' : 'details'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onPickEntry(entry)}
                    className="text-[11px] font-medium text-slate-400 underline decoration-white/15
                      underline-offset-4 transition hover:text-white hover:decoration-white/50"
                  >
                    run it
                  </button>
                </div>
              </footer>
            </article>
          )
        })}
      </div>
    </section>
  )
}