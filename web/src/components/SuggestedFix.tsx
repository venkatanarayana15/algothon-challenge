import { useState } from 'react'
import type { SuggestedFix as Fix } from '../lib/fix'
import { copyToClipboard } from '../lib/format'
import { Icon } from './Icons'

interface Props {
  fix: Fix | null
  /** True when this session applied the guard and has not reverted it. */
  applied: boolean
  isRunning: boolean
  onApply: () => void
  onRevert: () => void
}

/**
 * Closes the loop the problem statement actually asks for: *apply a secure fix,
 * then retest to prove it held.*
 *
 * A finding that only says "this input gets through" leaves the reader to work
 * out the fix. The guard here is one line, it is shown before it is applied,
 * it reuses the author's own rejection statement, and applying it re-runs the
 * analysis immediately — so "fixed" is never a claim, it is the next result on
 * the same screen.
 */
export function SuggestedFix({ fix, applied, isRunning, onApply, onRevert }: Props) {
  const [copied, setCopied] = useState(false)

  if (!fix && !applied) return null

  if (applied) {
    return (
      <section className="panel-raised animate-fade-up border-emerald-500/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
              <Icon name="check" className="h-3 w-3 text-emerald-300" weight={2.4} />
            </span>
            <h3 className="text-sm font-semibold text-white">Guard applied</h3>
          </div>
          <button
            type="button"
            onClick={onRevert}
            disabled={isRunning}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium
              text-slate-400 transition hover:border-white/15 hover:text-slate-200 disabled:opacity-40"
          >
            Revert to the vulnerable version
          </button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-slate-400">
          The guard is now the first statement in the function. Reverting restores the original
          source so the bypass can be reproduced again — worth doing if you want to show the
          before and after.
        </p>
      </section>
    )
  }

  if (!fix) return null

  const copy = async () => {
    if (await copyToClipboard(fix.guard)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <section className="panel-raised animate-fade-up border-emerald-500/20 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
            <Icon name="audit" className="h-3 w-3 text-emerald-300" weight={2} />
          </span>
          <h3 className="text-sm font-semibold text-white">One line fixes this</h3>
        </div>
        <span className="chip border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
          we do not apply it without a click
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-slate-400">{fix.reason}</p>

      <div className="relative mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-3.5 py-3">
        <button
          type="button"
          onClick={copy}
          className="absolute right-2.5 top-2.5 rounded-md border border-white/10 bg-ink-800/90 px-2 py-1
            text-[10px] font-medium text-slate-400 transition hover:text-white"
        >
          {copied ? 'copied' : 'copy'}
        </button>
        <p className="label mb-2 text-emerald-400/80">first statement in {fix.param}'s validator</p>
        <code className="block break-words pr-12 font-mono text-[12px] leading-relaxed text-emerald-100">
          {fix.guard}
        </code>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onApply}
          disabled={isRunning}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2
            text-xs font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-40"
        >
          <Icon name="try" className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} weight={2} />
          {isRunning ? 'Applying…' : 'Apply the guard and retest'}
        </button>
        <span className="text-[11px] text-slate-500">
          reuses your own rejection value · keeps the original for a one-click revert
        </span>
      </div>
    </section>
  )
}
