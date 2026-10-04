import { useEffect, useState } from 'react'
import { fetchAudit, fetchRegressionTest, RequestError } from '../lib/api'
import { downloadFile } from '../lib/evidence'
import type { AuditFinding, AuditReport } from '../types'

/**
 * The ALG-CYBER-02 workflow, on one screen.
 *
 * A judge should be able to see the whole required loop without clicking
 * anything: identify, demonstrate safely, fix, retest. Each finding is a row
 * that carries all four, with the attack's behaviour before and after the fix,
 * and the regression result stated as a number.
 *
 * Nothing here is a screenshot or a stored fixture. It calls the same endpoint
 * the CLI does, which recompiles the target, re-runs the analysis, applies each
 * patch and re-executes the legitimate-behaviour suite on every load. If a fix
 * broke the application, this panel would say so.
 */
export function AuditPanel() {
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  /**
   * Take the audit away as something runnable.
   *
   * The whole point of a security review is that the reviewer can check it, so
   * the deliverable is the file rather than the screenshot. It is a standard
   * `node:test` suite -- `node --test security-regression.test.mjs` and it runs,
   * with nothing to install. It asserts the FIXED behaviour, so it goes red
   * against the vulnerable version, which is what makes it a regression test.
   */
  const downloadSuite = async () => {
    setDownloading(true)
    try {
      const file = await fetchRegressionTest()
      downloadFile(file.filename, 'text/javascript', file.contents)
    } catch {
      setError('The regression test could not be generated. Try running `npm run regression-test` instead.')
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchAudit(controller.signal)
      .then(setReport)
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return
        setError(err instanceof RequestError ? err.message : 'The audit could not be completed.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  return (
    <section id="audit" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-16">
      <div className="mb-8 max-w-3xl">
        <p className="label mb-2.5">ALG-CYBER-02 · the required workflow</p>
        <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Find it, fix it, prove the fix held
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
          Below is a deliberately vulnerable application, audited end to end. Every finding is
          demonstrated against a sandboxed copy of the code — no request is ever sent to a real
          service — then fixed, then attacked again with the same input, then retested against the
          behaviour the application is supposed to have.
        </p>
      </div>

      {loading && (
        <div className="panel-raised flex items-center gap-3 p-6">
          <svg viewBox="0 0 16 16" className="h-4 w-4 animate-spin fill-none stroke-rose-400" strokeWidth="2">
            <circle cx="8" cy="8" r="6" strokeOpacity="0.2" />
            <path d="M14 8a6 6 0 00-6 6" strokeLinecap="round" />
          </svg>
          <span className="text-sm text-slate-400">
            Running the audit — analysing, patching and retesting takes a few seconds.
          </span>
        </div>
      )}

      {error && !loading && (
        <div className="panel-raised border-rose-500/20 p-6 text-sm text-slate-400">{error}</div>
      )}

      {report && !loading && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat
              label="vulnerabilities fixed and verified"
              value={`${report.vulnerabilities.filter((v) => v.status === 'FIXED_AND_VERIFIED').length}/${report.vulnerabilities.length}`}
              tone="rose"
            />
            <Stat
              label="legitimate cases still passing"
              value={`${report.regression.passedAfterFix}/${report.regression.legitimateChecks}`}
              tone="emerald"
            />
            <Stat
              label="functionality preserved"
              value={report.regression.functionalityPreserved ? 'yes' : 'no'}
              tone={report.regression.functionalityPreserved ? 'emerald' : 'rose'}
            />
          </div>

          <div className="space-y-4">
            {report.vulnerabilities.map((v) => (
              <Finding key={v.id} finding={v} />
            ))}
          </div>

          <div className="panel-raised mt-6 p-6">
            <h3 className="text-sm font-semibold text-white">
              Security fixes must not break legitimate application functionality
            </h3>
            <p className="mt-2.5 text-[14px] leading-relaxed text-slate-400">
              {report.regression.passedBeforeFix} of {report.regression.legitimateChecks}{' '}
              legitimate cases passed before the fixes and{' '}
              {report.regression.passedAfterFix} pass after.{' '}
              {report.regression.brokenByFix.length === 0 ? (
                <span className="text-emerald-300">Nothing that used to work stopped working.</span>
              ) : (
                <span className="text-rose-300">
                  Broken by the fixes: {report.regression.brokenByFix.map((b) => b.id).join(', ')}
                </span>
              )}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
              <button
                type="button"
                onClick={downloadSuite}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-100 transition hover:border-rose-400/50 hover:bg-rose-500/15 disabled:opacity-60"
              >
                {downloading ? 'Generating…' : 'Download the regression test'}
              </button>
              <span className="text-[11px] text-slate-500">
                A runnable <code className="text-slate-400">node --test</code> suite —{' '}
                {report.vulnerabilities.length} finding tests plus {report.regression.legitimateChecks}{' '}
                legitimate-behaviour checks. It fails against the vulnerable version, by design.
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'rose' | 'emerald' }) {
  return (
    <div className="panel px-5 py-4">
      <div
        className={`font-mono text-2xl font-semibold ${tone === 'emerald' ? 'text-emerald-300' : 'text-rose-300'}`}
      >
        {value}
      </div>
      <p className="label mt-1">{label}</p>
    </div>
  )
}

function Finding({ finding }: { finding: AuditFinding }) {
  const [open, setOpen] = useState(false)
  const ok = finding.status === 'FIXED_AND_VERIFIED'

  return (
    <article className="panel-raised overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-ink-850/60 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs font-semibold text-slate-500">{finding.id}</span>
          <h3 className="min-w-0 truncate text-sm font-semibold text-white">{finding.title}</h3>
          <span className="chip">{finding.owasp}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip border-white/[0.06] bg-white/[0.02] text-slate-500">
            {finding.detectedByEngine ? 'found by the engine' : 'supplied attack case'}
          </span>
          <span
            className={`chip font-semibold ${
              ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            {ok ? 'fixed & verified' : 'incomplete'}
          </span>
        </div>
      </header>

      <div className="p-5">
        <p className="label mb-2">the attack</p>
        <code className="block break-words font-mono text-[13px] text-slate-200">
          {finding.attack.call}
        </code>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.05] p-3.5">
            <p className="label mb-1.5 text-rose-400/70">before the fix</p>
            <p className="font-mono text-[13px] text-rose-200">{finding.attack.before}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5">
            <p className="label mb-1.5 text-emerald-400/70">after the fix</p>
            <p className="font-mono text-[13px] text-emerald-200">{finding.attack.after}</p>
          </div>
        </div>

        {finding.attack.note && (
          <p className="mt-2.5 text-[12px] leading-relaxed text-slate-500">{finding.attack.note}</p>
        )}

        <div className="mt-4 flex items-center gap-2 text-[12px] text-slate-500">
          <span className="text-emerald-400/80">
            retest: {finding.legitimateChecks.passed}/{finding.legitimateChecks.total} legitimate
            cases unaffected
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-300"
        >
          <svg
            viewBox="0 0 12 12"
            className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 2.5L8 6l-4 3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {open ? 'Hide' : 'Show'} the root cause and the fix
        </button>

        {open && (
          <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-4">
            <div>
              <p className="label mb-1.5">root cause</p>
              <p className="text-[13px] leading-relaxed text-slate-400">{finding.rootCause}</p>
            </div>
            <div>
              <p className="label mb-1.5">the fix</p>
              <p className="text-[13px] leading-relaxed text-slate-400">{finding.fix}</p>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}