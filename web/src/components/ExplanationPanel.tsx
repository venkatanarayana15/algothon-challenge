import type { Explanation } from '../types'
import { CodeBlock } from './CodeBlock'

interface Props {
  explanation: Explanation | null
}

/**
 * Renders the root cause. When the model produced a patch we show it as a
 * diff; when it did not, we say so rather than leaving an empty box. The
 * `confidence` flag is always visible: a judge should never have to guess
 * whether prose came from a model or from a rule.
 */
export function ExplanationPanel({ explanation }: Props) {
  if (!explanation) return null

  const fromModel = explanation.confidence === 'model'

  return (
    <section className="panel animate-fade-up p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">What went wrong</h3>
        <span className="chip">
          {fromModel ? 'written by the model' : 'pattern match'}
        </span>
      </div>

      <p className="text-[15px] leading-relaxed text-slate-200">{explanation.summary}</p>

      {explanation.detail && (
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{explanation.detail}</p>
      )}

      {explanation.patch?.trim() && (
        <div className="mt-4">
          <p className="label mb-2">Suggested fix</p>
          <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-ink-950/60">
            <CodeBlock code={explanation.patch.trim()} className="text-[12px]" />
          </div>
        </div>
      )}
    </section>
  )
}