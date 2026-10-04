import type { AnalysisReport } from '../types'
import { Icon } from './Icons'
import { useToast } from './Toast'
import { copyToClipboard } from '../lib/format'
import {
  buildShareUrl,
  downloadFile,
  regressionAssertion,
  reportToMarkdown,
  safeFilename,
} from '../lib/evidence'

interface Props {
  report: AnalysisReport
  code: string
  spec: string
}

/**
 * The end of the workflow that most tools forget: getting the finding out of
 * the tool and into the place where it will actually be fixed.
 *
 * A counterexample on a screen is a demo. An assertion in a test file is a
 * regression guard, a permalink is a reproducible bug report, and a Markdown or
 * JSON record is what gets attached to a ticket. All three are one click from
 * the report that is already on screen.
 */
export function EvidenceActions({ report, code, spec }: Props) {
  const { push } = useToast()

  const assertion = regressionAssertion(report)

  const copy = async (text: string, message: string) => {
    const ok = await copyToClipboard(text)
    push(ok ? message : 'The clipboard is blocked in this browser — select and copy manually.', ok ? 'ok' : 'warn')
  }

  const share = async () => {
    const url = buildShareUrl({
      code,
      spec,
      functionName: report.functionName,
      policyId: '',
    })
    if (!url) {
      push('This repro is too large for a URL — copy the code instead.', 'warn')
      return
    }
    // Reflecting the link back into the address bar means a refresh reproduces
    // the same run, so the link is verifiable before it is sent.
    window.history.replaceState(null, '', url)
    await copy(url, 'Repro link copied — it reopens this exact case.')
  }

  return (
    <section className="panel animate-fade-up p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-white">Take the finding with you</h3>
        <span className="text-[11px] text-slate-600">
          generated from the report above · nothing is uploaded
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {assertion && (
          <ActionButton
            icon="check"
            label="Copy regression test"
            primary
            onClick={() => copy(assertion, 'Assertion copied — paste it into your test file.')}
          />
        )}
        <ActionButton icon="share" label="Share this repro" onClick={share} />
        <ActionButton
          icon="copy"
          label="Copy report"
          onClick={() => copy(reportToMarkdown(report, code, spec), 'Markdown report copied.')}
        />
        <ActionButton
          icon="download"
          label="Download JSON"
          onClick={() => {
            downloadFile(
              safeFilename(report.functionName, 'json'),
              'application/json',
              JSON.stringify({ report, code, spec }, null, 2),
            )
            push('Report downloaded as JSON.')
          }}
        />
      </div>
    </section>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  primary = false,
}: {
  icon: string
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
        primary
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-100 hover:border-rose-400/50 hover:bg-rose-500/15'
          : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-white/15 hover:text-slate-200'
      }`}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
