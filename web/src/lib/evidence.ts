import type { AnalysisReport } from '../types'
import { formatValue } from './format'

/**
 * Everything a judge needs to keep the finding after the tab closes.
 *
 * Three artefacts, each aimed at a different moment: a permalink to reproduce
 * the run, a one-line assertion to paste into a real test suite, and a Markdown
 * or JSON record of the finding for a bug report. All three are generated from
 * the analysis report already in memory -- nothing is re-run or uploaded.
 */

export interface SharedState {
  code: string
  spec: string
  functionName: string
  policyId: string
}

const SHARE_PREFIX = '#repro='
const SHARE_VERSION = 1
const STORAGE_KEY = 'counterexample.state.v1'

/* ------------------------------------------------------------------ permalink */

/**
 * UTF-8 safe, URL safe base64. `btoa` alone throws on the unicode that real
 * source code contains (a string literal with an emoji is enough), so the
 * string is widened to bytes first.
 */
function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Longer than this and the URL stops surviving chat clients, which truncate.
 * A repro that arrives corrupted is worse than no link at all, so the caller is
 * told to fall back to copying the code.
 */
const MAX_SHARE_LENGTH = 6000

export function buildShareUrl(state: SharedState): string | null {
  const payload = JSON.stringify({
    v: SHARE_VERSION,
    c: state.code,
    s: state.spec,
    f: state.functionName,
    p: state.policyId,
  })
  const encoded = encodeBase64Url(payload)
  if (encoded.length > MAX_SHARE_LENGTH) return null

  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}${SHARE_PREFIX}${encoded}`
}

/** Read a shared repro out of the current URL, ignoring anything malformed. */
export function readSharedState(): SharedState | null {
  const hash = window.location.hash
  if (!hash.startsWith(SHARE_PREFIX)) return null
  try {
    const parsed = JSON.parse(decodeBase64Url(hash.slice(SHARE_PREFIX.length))) as Record<string, unknown>
    if (typeof parsed.c !== 'string') return null
    return {
      code: parsed.c,
      spec: typeof parsed.s === 'string' ? parsed.s : '',
      functionName: typeof parsed.f === 'string' ? parsed.f : '',
      policyId: typeof parsed.p === 'string' ? parsed.p : '',
    }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ persistence */

export function loadStoredState(): SharedState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.code !== 'string') return null
    return {
      code: parsed.code,
      spec: typeof parsed.spec === 'string' ? parsed.spec : '',
      functionName: typeof parsed.functionName === 'string' ? parsed.functionName : '',
      policyId: typeof parsed.policyId === 'string' ? parsed.policyId : '',
    }
  } catch {
    return null
  }
}

export function saveStoredState(state: SharedState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private mode and full quotas both land here. Persistence is a
    // convenience, so a failure must never surface as an error.
  }
}

/* ------------------------------------------------------------------ assertion */

/**
 * One paste-ready regression test for the reported finding.
 *
 * A bug report that says "NaN gets through the quantity check" is a story; a
 * failing assertion is a ticket. The convention for validators (accept returns
 * a falsy value) is stated in the comment rather than assumed silently, because
 * the engine cannot know what a foreign validator returns on success.
 */
export function regressionAssertion(report: AnalysisReport): string | null {
  const call = report.minimal?.call ?? report.finding?.call
  if (!call) return null

  const finding = report.finding
  const label = report.bugClass ? ` [${report.bugClass}]` : ''

  if (finding?.verdict === 'bypass') {
    return [
      `// Regression: ${call} must be rejected${label}`,
      `// Assumes a validator signals acceptance with a falsy return value.`,
      `assert.ok(${call}, '${call} was accepted but must be rejected');`,
    ].join('\n')
  }

  if (finding?.verdict === 'false-rejection') {
    return [
      `// Regression: ${call} is valid and must be accepted${label}`,
      `// Assumes a validator signals acceptance with a falsy return value.`,
      `assert.ok(!${call}, '${call} was rejected but is valid');`,
    ].join('\n')
  }

  if (finding?.kind === 'timeout') {
    return [
      `// Regression: must terminate${label}`,
      `assert.doesNotThrow(() => { ${call}; });`,
    ].join('\n')
  }

  if (finding?.kind === 'nondeterministic') {
    return [
      `// Regression: two identical calls must agree${label}`,
      `assert.deepEqual(${call}, ${call});`,
    ].join('\n')
  }

  if (finding?.errorMessage) {
    return [
      `// Regression: must not throw${label}`,
      `// ${finding.errorMessage}`,
      `assert.doesNotThrow(() => { ${call}; });`,
    ].join('\n')
  }

  if (finding?.expected !== undefined) {
    return [
      `// Regression${label}`,
      `assert.deepEqual(${call}, ${formatValue(finding.expected)});`,
    ].join('\n')
  }

  return [`// Regression${label}`, `// no independent expected value was available`, `${call};`].join('\n')
}

/* ------------------------------------------------------------------ markdown */

export function reportToMarkdown(report: AnalysisReport, code: string, spec: string): string {
  const lines: string[] = []
  const finding = report.finding
  const verdict = finding?.verdict

  lines.push(`# A2Z Cyber report`)
  lines.push('')
  lines.push(`- **Function:** \`${report.functionName}\``)
  lines.push(`- **Status:** ${report.status}`)
  if (report.bugClass) lines.push(`- **Bug class:** ${report.bugClass} (heuristic label)`)
  if (spec.trim()) lines.push(`- **Spec:** ${spec.trim()}`)
  lines.push(`- **Inputs tested:** ${report.stats.inputsTested.toLocaleString()}`)
  lines.push(`- **Compared against:** ${report.oracle.signature || 'none'}`)
  lines.push(`- **Analysis time:** ${(report.analysisMs / 1000).toFixed(1)}s`)
  lines.push('')

  if (finding && report.minimal) {
    lines.push(`## Minimal counterexample`)
    lines.push('')
    lines.push('```js')
    lines.push(report.minimal.call)
    lines.push('```')
    lines.push('')
    if (verdict === 'bypass') {
      lines.push(`**Validation bypass.** The validator said \`accept\`; the rule requires \`reject\`.`)
      lines.push('')
    } else if (verdict === 'false-rejection') {
      lines.push(`**False rejection.** The validator rejected an input the rule allows.`)
      lines.push('')
    } else {
      if (finding.expected !== undefined) {
        lines.push(`- Expected: \`${formatValue(finding.expected)}\``)
      }
      lines.push(`- Actual: \`${finding.errorMessage ?? formatValue(finding.actual)}\``)
      lines.push('')
    }
  }

  lines.push(`## Subject under test`)
  lines.push('')
  lines.push('```js')
  lines.push(code.trim())
  lines.push('```')
  lines.push('')

  const assertion = regressionAssertion(report)
  if (assertion) {
    lines.push(`## Regression test`)
    lines.push('')
    lines.push('```js')
    lines.push(assertion)
    lines.push('```')
    lines.push('')
  }

  if (report.oracle.code?.trim()) {
    lines.push(`## Reference the subject was compared against`)
    lines.push('')
    lines.push('```js')
    lines.push(report.oracle.code.trim())
    lines.push('```')
    lines.push('')
  }

  if (report.explanation) {
    lines.push(`## Root cause`)
    lines.push('')
    lines.push(report.explanation.summary)
    if (report.explanation.detail) {
      lines.push('')
      lines.push(report.explanation.detail)
    }
    if (report.explanation.patch?.trim()) {
      lines.push('')
      lines.push('```js')
      lines.push(report.explanation.patch.trim())
      lines.push('```')
    }
    lines.push('')
  }

  if (report.mutationScore && report.mutationScore.total > 0) {
    lines.push(
      `_Mutation check: this counterexample killed ${report.mutationScore.killed}/${report.mutationScore.total} injected faults._`,
    )
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push(
    `Generated by A2Z Cyber, deterministic differential testing for JavaScript. No code left the browser beyond the analysis request.`,
  )

  return lines.join('\n')
}

/* ------------------------------------------------------------------ download */

export function downloadFile(filename: string, mime: string, contents: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function safeFilename(functionName: string, ext: string): string {
  const base = functionName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'report'
  return `counterexample-${base}.${ext}`
}
