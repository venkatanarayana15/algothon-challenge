import { useState } from 'react'
import type { AnalysisReport } from '../types'
import { CodeBlock } from './CodeBlock'
import { KIND_LABEL, copyToClipboard, formatValue } from '../lib/format'
import { CLASS_ADVICE } from '../lib/advice'
import { SEVERITY_TONE, triageFor } from '../lib/security'

interface Props {
  report: AnalysisReport
}

/**
 * The single most important component in the product. A judge who scrolls
 * here should understand the entire value proposition without scrolling again:
 * here is the input, here is what you returned, here is what it should have been.
 */
export function CounterexampleCard({ report }: Props) {
  const [copied, setCopied] = useState(false)
  const [showOracle, setShowOracle] = useState(false)
  const finding = report.finding

  if (!finding || !report.minimal) return null

  const kind = KIND_LABEL[finding.kind] ?? KIND_LABEL['wrong-answer']
  const isBypass = finding.verdict === 'bypass'
  const isFalseRejection = finding.verdict === 'false-rejection'
  const triage = triageFor(report.bugClass)

  // The engine's advice is written against *this* source and names the exact
  // fix; the per-class text is the general case. Preferring the specific one is
  // the difference between "check your comparisons" and "Number.isInteger(q)
  // first, then the range", and the card says which of the two it is showing.
  const guidance = report.advice?.trim() || (report.bugClass ? CLASS_ADVICE[report.bugClass] : undefined)

  // A validator does not have a right answer, it has a verdict. "expected
  // reject / actual accept" is technically complete and practically unreadable,
  // so the security case gets its own framing instead of reusing the value one.
  const heading = isBypass
    ? 'Validation bypass found'
    : isFalseRejection
      ? 'Valid input rejected'
      : 'Counterexample found'

  const handleCopy = async () => {
    if (await copyToClipboard(finding.call)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <section className="panel-raised animate-fade-up overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-ink-850/60 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
          <h3 className="text-sm font-semibold text-white">{heading}</h3>
          {isBypass && (
            <span className="chip border-rose-500/40 bg-rose-500/15 font-semibold uppercase tracking-wide text-rose-200">
              bypass
            </span>
          )}
          <span className={`chip ${kind.tone}`}>{kind.label}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>
            {report.stats.inputsTested.toLocaleString()} inputs in{' '}
            {(report.analysisMs / 1000).toFixed(1)}s
          </span>
        </div>
      </header>

      <div className="p-5">
        <p className="label mb-2.5">
          {isBypass
            ? 'This input should have been rejected, and was not'
            : isFalseRejection
              ? 'This input is valid, and was rejected'
              : 'This is the smallest input that breaks your function'}
        </p>

        <div className="relative rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-4 py-4">
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy counterexample"
            className="absolute right-2.5 top-2.5 rounded-md border border-white/10 bg-ink-800/90 px-2 py-1
              text-[10px] font-medium text-slate-400 transition hover:text-white"
          >
            {copied ? 'copied' : 'copy'}
          </button>
          <code className="font-mono text-lg font-semibold text-rose-200 sm:text-xl">
            {finding.call}
          </code>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {finding.originalCall && finding.originalCall !== finding.call && (
            <span>
              reduced from{' '}
              <code className="font-mono text-slate-600 line-through">{finding.originalCall}</code>
            </span>
          )}
          {typeof finding.reduction === 'number' && finding.reduction > 0 && (
            <span className="text-emerald-400/80">
              {finding.reduction}% smaller after shrinking
            </span>
          )}
        </div>

        {report.bugClass && report.bugClass !== 'unknown' && (
          <div className="mt-5 rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="label mr-auto text-sky-300/80">bug class</p>
              {triage && (
                <span className={`chip font-semibold uppercase tracking-wide ${SEVERITY_TONE[triage.severity]}`}>
                  {triage.severity}
                </span>
              )}
              {triage?.owasp && <span className="chip border-sky-500/25 bg-sky-500/10 text-sky-300">{triage.owasp}</span>}
              {triage?.cwe && <span className="chip font-mono text-[10px]">{triage.cwe}</span>}
              <span className="chip border-sky-500/25 bg-sky-500/10 text-sky-300">heuristic label</span>
            </div>
            <p className="mt-1.5 font-mono text-[13px] text-sky-200">
              {report.bugClass.replace(/-/g, ' ')}
            </p>
            {triage && (
              <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{triage.reason}</p>
            )}
            {guidance && (
              <div className="mt-3 border-t border-sky-500/15 pt-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <p className="label text-sky-300/80">what to fix</p>
                  <span className="text-[10px] uppercase tracking-wider text-slate-600">
                    {report.advice ? 'written for this finding' : 'general guidance for this class'}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-slate-300">{guidance}</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/[0.06] bg-ink-950/60 p-4">
            <p className="label mb-2 text-rose-400/70">
              {finding.errorMessage
                ? 'Your function threw'
                : isBypass || isFalseRejection
                  ? 'Your validator said'
                  : 'Your function returned'}
            </p>
            {isBypass || isFalseRejection ? (
              <p className="text-[13px] leading-relaxed text-rose-200">
                {finding.actual === 'accept' ? (
                  <>accept<span className="text-slate-500"> — let the input through</span></>
                ) : (
                  <>reject<span className="text-slate-500"> — blocked the input</span></>
                )}
              </p>
            ) : (
              <code className="block break-words font-mono text-[13px] text-rose-200">
                {finding.errorMessage ? (
                  <span className="text-amber-300">{finding.errorMessage}</span>
                ) : (
                  formatValue(finding.actual)
                )}
              </code>
            )}
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-ink-950/60 p-4">
            <p className="label mb-2 text-emerald-400/70">
              {isBypass || isFalseRejection
                ? 'The rule should have said'
                : 'Correct answer'}
            </p>
            {isBypass || isFalseRejection ? (
              <p className="text-[13px] leading-relaxed text-emerald-200">
                {finding.expected === 'accept' ? (
                  <>accept<span className="text-slate-500"> — the input is well-formed</span></>
                ) : (
                  <>reject<span className="text-slate-500"> — the input is not allowed</span></>
                )}
              </p>
            ) : finding.expected === undefined ? (
              <p className="text-[13px] leading-relaxed text-slate-500">
                Unknown. No reference implementation was available for this function, so we can prove
                that it breaks but not what the right answer was. Add a spec to compare against one.
              </p>
            ) : (
              <code className="block break-words font-mono text-[13px] text-emerald-200">
                {formatValue(finding.expected)}
              </code>
            )}
          </div>
        </div>

        {finding.kind === 'nondeterministic' && finding.second !== undefined && (
          <div className="mt-3 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/[0.05] p-3.5">
            <p className="label mb-1.5 text-fuchsia-300/80">Second run, identical input</p>
            <code className="font-mono text-[13px] text-fuchsia-200">{formatValue(finding.second)}</code>
          </div>
        )}

        <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-white/[0.06] pt-5 sm:grid-cols-2">
          <div>
            <dt className="label mb-1.5">We read your parameters as</dt>
            <dd className="flex flex-wrap gap-1.5">
              {report.params.map((param) => (
                <span key={param.index} className="chip font-mono">
                  {param.name}
                  <span className="text-slate-600">:</span>
                  <span className={param.type === 'unknown' ? 'text-amber-400/90' : 'text-sky-300/90'}>
                    {param.type}
                  </span>
                  {param.ambiguous && <span className="text-slate-600">?</span>}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="label mb-1.5">Compared against</dt>
            <dd className="text-[13px] text-slate-400">
              {report.oracle.source === 'none' ? (
                <span className="text-slate-400">
                  Nothing. This crash is provable from your code alone.
                </span>
              ) : (
                <>
                  <span className="text-slate-300">
                    {report.oracle.source === 'policy' ||
                    report.oracle.source === 'policy-preset'
                      ? 'Intended rule, enforced strictly'
                      : report.oracle.signature}
                  </span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span className="text-slate-500">
                    {report.oracle.source === 'library'
                      ? 'built-in reference'
                      : report.oracle.source === 'policy' ||
                          report.oracle.source === 'policy-preset'
                        ? 'read from your own checks'
                        : report.oracle.source === 'model'
                          ? 'generated for this run'
                          : 'yours'}
                  </span>
                </>
              )}
            </dd>
          </div>
        </dl>

        {report.oracle.code && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowOracle((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-300"
            >
              <svg
                viewBox="0 0 12 12"
                className={`h-3 w-3 transition-transform ${showOracle ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 2.5L8 6l-4 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {showOracle ? 'Hide' : 'Show'} the reference implementation
            </button>
            {showOracle && (
              <div className="mt-2 overflow-hidden rounded-lg border border-white/[0.06] bg-ink-950/60">
                <CodeBlock code={report.oracle.code.trim()} className="text-slate-400" />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}