import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import snapshot from './data/snapshot.json'
import type { AnalysisReport, Example, RunRecord, SnapshotEntry } from './types'
import { analyze, fetchExamples, fetchHealth, RequestError } from './lib/api'
import type { EngineHealth } from './lib/api'
import { findPolicy } from './lib/policies'
import { NAV_IDS, NAV_SECTIONS, scrollToSection } from './lib/nav'
import { useScrollSpy } from './hooks/useScrollSpy'
import {
  buildShareUrl,
  downloadFile,
  loadStoredState,
  readSharedState,
  regressionAssertion,
  reportToMarkdown,
  safeFilename,
  saveStoredState,
} from './lib/evidence'
import { copyToClipboard } from './lib/format'
import { Icon } from './components/Icons'
import { TopBar } from './components/TopBar'
import { SideNav } from './components/SideNav'
import { BottomNav } from './components/BottomNav'
import { CommandPalette } from './components/CommandPalette'
import type { PaletteAction } from './components/CommandPalette'
import { useToast } from './components/Toast'
import { EvidenceActions } from './components/EvidenceActions'
import { SuggestedFix } from './components/SuggestedFix'
import { RunTrail } from './components/RunTrail'
import { suggestFix } from './lib/fix'
import { Hero } from './components/Hero'
import { AuditPanel } from './components/AuditPanel'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { Editor } from './components/Editor'
import { Gallery } from './components/Gallery'
import { Pipeline, HonestLimits } from './components/Pipeline'
import { BenchmarkMatrix } from './components/BenchmarkMatrix'
import { CounterexampleCard } from './components/CounterexampleCard'
import { ResultSheet } from './components/ResultSheet'
import { PhaseTrace } from './components/PhaseTrace'
import { MutationPanel } from './components/MutationPanel'
import { ExplanationPanel } from './components/ExplanationPanel'

/**
 * What the editor starts with.
 *
 * Deliberately a validator rather than a generic algorithm. Two reasons: it is
 * what ALG-CYBER-02 asks about, and it produces the most legible result the tool
 * has -- `validateQty(NaN)` is one line of ordinary code that passes review
 * everywhere it gets written, and the finding is unmistakable.
 *
 * It needs no configuration. The policy is inferred from the function's own
 * comparisons, so a judge can paste their own validator and get the same class
 * of answer with nothing selected.
 */
const DEFAULT_CODE = `// POST /cart/items  ->  null | error string
// Returns null when the quantity is accepted, an error message otherwise.
function validateQty(q) {
  if (q <= 0) return 'quantity must be positive';
  if (q > 100) return 'quantity exceeds maximum';
  return null;
}`

/** The id of the seeded case the one-click demo reproduces. */
const DEMO_EXAMPLE_ID = 'validate-qty-nan-bypass'

/** Seeded entries double as the example picker, so one source of truth. */
const SEEDED_EXAMPLES: Example[] = (snapshot.entries as SnapshotEntry[]).map((entry) => ({
  id: entry.id,
  title: entry.title,
  difficulty: entry.difficulty,
  language: entry.language,
  oracleSignature: '',
  spec: entry.spec,
  tags: entry.tags,
  bugClass: entry.bugClass,
  code: entry.code,
  counterexample: entry.counterexample,
  rootCause: entry.rootCause,
  fix: entry.fix,
}))

interface RunOverride {
  code: string
  spec: string
  functionName: string
  policyId: string
}

/** How a run was started, so the verification trail can say so. */
type RunOrigin = 'manual' | 'demo' | 'fix'

/** True when the keystroke is going into a field the user is typing in. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export default function App() {
  // A shared repro link wins over the last thing this browser was working on,
  // because the link was the point of sending it.
  const shared = useMemo(() => readSharedState(), [])
  const restored = useMemo(() => shared ?? loadStoredState(), [shared])

  const [code, setCode] = useState(restored?.code ?? DEFAULT_CODE)
  const [spec, setSpec] = useState(restored?.spec ?? '')
  const [functionName, setFunctionName] = useState(restored?.functionName ?? '')
  const [policyId, setPolicyId] = useState(restored?.policyId ?? '')
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [examples, setExamples] = useState<Example[]>(SEEDED_EXAMPLES)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [health, setHealth] = useState<EngineHealth | null>(null)
  const [history, setHistory] = useState<RunRecord[]>([])
  /** Source held while an applied guard is in place, so it can be restored. */
  const [previousCode, setPreviousCode] = useState<string | null>(null)
  /**
   * The witness the guard was applied to close.
   *
   * A clean retest after a fix must name what it verified, otherwise the loop
   * closes with a generic "nothing found" that treats a repaired bug the same
   * as a first-time clean scan. Captured from the report being fixed, because
   * the retest overwrites it.
   */
  const [fixWitness, setFixWitness] = useState<string | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  /** The short result sheet, shown when a run the visitor asked for finishes. */
  const [sheetOpen, setSheetOpen] = useState(false)
  const autoRanRef = useRef(false)
  const runIdRef = useRef(1)

  const spy = useScrollSpy(NAV_IDS)
  const { push } = useToast()

  // Live examples from the API, with the static snapshot as an instant fallback.
  useEffect(() => {
    const controller = new AbortController()
    fetchExamples(controller.signal)
      .then((list) => list.length > 0 && setExamples(list))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  // Engine status for the top bar. A failed check is itself information: it
  // renders as "unreachable" rather than silently disappearing.
  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then(setHealth)
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return
        setHealth({ ok: false, llm: null, uptimeSeconds: 0 })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    saveStoredState({ code, spec, functionName, policyId })
  }, [code, spec, functionName, policyId])

  /**
   * `override` exists so the demo can run the seeded case immediately, without
   * waiting for four `setState` calls to land — the request would otherwise be
   * sent with the previous code.
   */
  const run = useCallback(
    async (override?: Partial<RunOverride>, origin: RunOrigin = 'manual') => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsRunning(true)
      setError(null)
      setReport(null)

      const subjectCode = override?.code ?? code
      const subjectSpec = override?.spec ?? spec
      const subjectFunction = override?.functionName ?? functionName
      const subjectPolicy = override?.policyId ?? policyId

      try {
        const preset = findPolicy(subjectPolicy)
        const result = await analyze(
          {
            code: subjectCode,
            functionName: subjectFunction.trim() || undefined,
            spec: subjectSpec.trim() || undefined,
            policy: preset
              ? { min: preset.min, max: preset.max, integer: preset.integer }
              : undefined,
          },
          controller.signal,
        )
        setReport(result)
        // The trail is the evidence that a fix was retested, so it records every
        // completed run, not only the interesting ones.
        setHistory((previous) => [
          ...previous.slice(-9),
          {
            id: runIdRef.current++,
            at: Date.now(),
            origin,
            status: result.status,
            bugClass: result.bugClass ?? null,
            call: result.minimal?.call ?? result.finding?.call ?? null,
            verdict: result.finding?.verdict,
            analysisMs: result.analysisMs,
          },
        ])
        requestAnimationFrame(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
        // Someone who pressed Analyse is waiting for an answer, so the short
        // version arrives as a sheet over the page they were on. Retests after
        // applying a fix stay inline: the interesting thing there is the
        // comparison against the previous run, which needs the page.
        if (origin === 'manual') setSheetOpen(true)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError(
          err instanceof RequestError ? err.message : 'Something went wrong. Please try again.',
        )
      } finally {
        setIsRunning(false)
      }
    },
    [code, functionName, spec, policyId],
  )

  const loadExample = useCallback((example: Example | SnapshotEntry) => {
    setCode(example.code)
    setSpec(example.spec ?? '')
    setFunctionName('')
    setPolicyId('')
    setReport(null)
    setError(null)
    requestAnimationFrame(() => scrollToSection('try'))
  }, [])

  /**
   * One click, one complete story: load the vulnerable validator, attack it,
   * and land on the minimal bypass. Judges have a queue of projects to get
   * through; this is the shortest honest path to the point of the submission.
   */
  const runDemo = useCallback(async () => {
    const demo =
      examples.find((example) => example.id === DEMO_EXAMPLE_ID) ??
      examples.find((example) => example.tags?.includes('security')) ??
      examples[0]
    if (!demo) return

    const nextSpec = demo.spec ?? ''
    setCode(demo.code)
    setSpec(nextSpec)
    setFunctionName('')
    setPolicyId('')
    setError(null)
    scrollToSection('try')

    await run({ code: demo.code, spec: nextSpec, functionName: '', policyId: '' }, 'demo')
  }, [examples, run])

  const fix = useMemo(() => suggestFix(report, code), [report, code])

  /**
   * Applies the one-line guard and retests immediately. The retest is the whole
   * point: it is what turns "I applied a fix" into "the bypass no longer
   * reproduces", and the two runs land in the trail next to each other.
   */
const applyFix = useCallback(async () => {
    if (!fix) return
    const next = fix.apply(code)
    if (!next) {
      push('Could not locate the function body to insert the guard into.', 'warn')
      return
    }
    // Keep the witness the guard exists to close. The retest describes the
    // guarded source, so without this the verified state cannot name it.
    setFixWitness(report?.finding?.call ?? report?.minimal?.call ?? null)
    setPreviousCode(code)
    setCode(next)
    push('Guard applied as the first statement - retesting now.')
    await run({ code: next }, 'fix')
  }, [fix, code, report, run, push])

const revertFix = useCallback(() => {
    if (previousCode === null) return
    setCode(previousCode)
    setPreviousCode(null)
    setFixWitness(null)
    // The report described the guarded source, so it no longer applies.
    setReport(null)
    push('Original source restored - run it again to see the bypass return.', 'warn')
  }, [previousCode, push])

  const copyText = useCallback(
    async (text: string, message: string) => {
      const ok = await copyToClipboard(text)
      push(ok ? message : 'The clipboard is blocked here — copy manually.', ok ? 'ok' : 'warn')
    },
    [push],
  )

  // Global shortcuts. ⌘K works anywhere; ⇧D is suppressed while typing so the
  // letter is not stolen from the editor.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        // Only one overlay at a time. Stacking the palette on top of the
        // shortcut sheet traps Escape in whichever one is not listening for it.
        setShortcutsOpen(false)
        setPaletteOpen((open) => !open)
        return
      }
      if (mod && event.key === 'Enter') {
        event.preventDefault()
        void run()
        return
      }
      if (event.shiftKey && !mod && event.key.toLowerCase() === 'd' && !isTypingTarget(event.target)) {
        event.preventDefault()
        void runDemo()
        return
      }
      // "?" is Shift+/ on most layouts, so it arrives as key "?" with shiftKey
      // already set. Checking the key alone is what makes it work on the
      // layouts where it is not, without stealing it from a text field.
      if (event.key === '?' && !isTypingTarget(event.target)) {
        event.preventDefault()
        setPaletteOpen(false)
        setShortcutsOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [run, runDemo])

  // A repro link should not just load the code — it should run it, so the
  // recipient sees the same finding without touching anything.
  useEffect(() => {
    if (autoRanRef.current) return
    autoRanRef.current = true
    if (!shared) return
    void run()
  }, [shared, run])

  const paletteActions = useMemo<PaletteAction[]>(() => {
    const actions: PaletteAction[] = NAV_SECTIONS.map((section) => ({
      id: `go:${section.id}`,
      label: section.label,
      hint: section.hint,
      group: 'Go to',
      icon: section.icon,
      keywords: `section navigate jump ${section.short}`,
      run: () => scrollToSection(section.id),
    }))

    actions.push(
      {
        id: 'run:analyze',
        label: 'Run the analysis',
        hint: 'attacks the code currently in the editor',
        group: 'Actions',
        icon: 'play',
        keywords: 'execute hunt counterexample',
        disabled: !code.trim(),
        run: () => void run(),
      },
      {
        id: 'run:demo',
        label: 'Run the demo',
        hint: 'the NaN validation bypass, found live',
        group: 'Actions',
        icon: 'audit',
        keywords: 'showcase tour judge start',
        run: () => void runDemo(),
      },
    )

    if (fix) {
      actions.push({
        id: 'fix:apply',
        label: 'Apply the suggested guard and retest',
        hint: fix.guard,
        group: 'Fix and retest',
        icon: 'audit',
        keywords: 'fix patch repair guard retest secure',
        run: () => void applyFix(),
      })
    }

    if (report) {
      const assertion = regressionAssertion(report)
      if (assertion) {
        actions.push({
          id: 'export:assertion',
          label: 'Copy the regression test',
          hint: assertion.split('\n').pop(),
          group: 'Take the finding with you',
          icon: 'check',
          keywords: 'assert test export',
          run: () => void copyText(assertion, 'Assertion copied.'),
        })
      }
      actions.push(
        {
          id: 'export:share',
          label: 'Share this repro',
          hint: 'a link that reopens this exact case',
          group: 'Take the finding with you',
          icon: 'share',
          keywords: 'link url permalink',
          run: () => {
            const url = buildShareUrl({ code, spec, functionName, policyId })
            if (!url) {
              push('This repro is too large for a URL — copy the code instead.', 'warn')
              return
            }
            void copyText(url, 'Repro link copied.')
          },
        },
        {
          id: 'export:markdown',
          label: 'Copy the report as Markdown',
          hint: 'subject, counterexample, root cause, assertion',
          group: 'Take the finding with you',
          icon: 'copy',
          keywords: 'markdown bug report writeup',
          run: () => void copyText(reportToMarkdown(report, code, spec), 'Markdown report copied.'),
        },
        {
          id: 'export:json',
          label: 'Download the report as JSON',
          hint: 'the full machine-readable analysis',
          group: 'Take the finding with you',
          icon: 'download',
          keywords: 'json file export download',
          run: () => {
            downloadFile(
              safeFilename(report.functionName, 'json'),
              'application/json',
              JSON.stringify({ report, code, spec }, null, 2),
            )
            push('Report downloaded as JSON.')
          },
        },
      )
    }

    for (const example of examples) {
      actions.push({
        id: `example:${example.id}`,
        label: example.title,
        hint: example.counterexample,
        group: 'Load an example',
        icon: 'gallery',
        keywords: `${example.bugClass} ${example.tags?.join(' ') ?? ''} ${example.difficulty}`,
        run: () => loadExample(example),
      })
    }

    return actions
  }, [
    code,
    spec,
    functionName,
    policyId,
    examples,
    report,
    fix,
    applyFix,
    run,
    runDemo,
    loadExample,
    copyText,
    push,
  ])

  return (
    <div className="relative z-10 min-h-screen">
      <TopBar
        progress={spy.progress}
        health={health}
        isRunning={isRunning}
        canRun={Boolean(code.trim())}
        onOpenPalette={() => {
          setShortcutsOpen(false)
          setPaletteOpen(true)
        }}
        onOpenShortcuts={() => {
          setPaletteOpen(false)
          setShortcutsOpen(true)
        }}
        onRun={() => void run()}
      />

      <SideNav active={spy.active} />

      <div className="lg:pl-60">
        {/* Bottom padding clears the mobile bar so the footer is never trapped
            behind it; the desktop rail needs no such allowance. */}
        <div className="pb-24 lg:pb-0">
          <Hero onPickEntry={loadExample} onRunDemo={() => void runDemo()} isRunning={isRunning} />

          <main id="try" className="mx-auto max-w-6xl px-5 pb-20">
            <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start">
              <Editor
                code={code}
                onCodeChange={setCode}
                spec={spec}
                onSpecChange={setSpec}
                functionName={functionName}
                onFunctionNameChange={setFunctionName}
                policyId={policyId}
                onPolicyIdChange={setPolicyId}
                onRun={() => void run()}
                onPickExample={loadExample}
                examples={examples}
                isRunning={isRunning}
              />

              <div ref={resultsRef} className="min-w-0 space-y-4">
                {isRunning && <RunningState />}
                {error && <ErrorState message={error} />}

                {!isRunning && !error && report && (
                  <>
                    {report.status === 'counterexample-found' && report.finding && (
                      <>
                        <CounterexampleCard report={report} />
                        <PhaseTrace report={report} />
                        {report.mutationScore && <MutationPanel score={report.mutationScore} />}
                        {report.explanation && <ExplanationPanel explanation={report.explanation} />}
                      </>
                    )}
                    {report.status === 'no-counterexample-found' && (
                      <>
                        {previousCode !== null && fixWitness ? (
                          <FixVerified report={report} witness={fixWitness} onRevert={revertFix} />
                        ) : (
                          <CleanState report={report} />
                        )}
                        <PhaseTrace report={report} />
                      </>
                    )}
                    {report.status === 'oracle-missing' && <OracleMissing report={report} />}

                    <SuggestedFix
                      fix={fix}
                      applied={previousCode !== null}
                      isRunning={isRunning}
                      onApply={() => void applyFix()}
                      onRevert={revertFix}
                    />

                    <EvidenceActions report={report} code={code} spec={spec} />
                  </>
                )}

                {!isRunning && !error && !report && <IdleState />}

                <RunTrail records={history} onClear={() => setHistory([])} />
              </div>
            </div>
          </main>

          {/* Evidence for the problem statement, after the tool rather than
              before it. The hero promises an interactive analyser, so the
              analyser has to come next; an auto-running audit report sitting
              between the promise and the thing reads as an unrelated spinner. */}
          <AuditPanel />

          <Gallery onPickEntry={loadExample} />
          <BenchmarkMatrix />
          <Pipeline />
          <HonestLimits />
          <Footer />
        </div>
      </div>

      <BottomNav active={spy.active} />
      <ScrollToTop visible={spy.scrolled} />
      <CommandPalette
        open={paletteOpen}
        actions={paletteActions}
        onClose={() => setPaletteOpen(false)}
      />
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {sheetOpen && report && (
        <ResultSheet
          report={report}
          fix={fix}
          fixApplied={previousCode !== null}
          onClose={() => setSheetOpen(false)}
          onApplyFix={() => {
            setSheetOpen(false)
            void applyFix()
          }}
          onSeeDetail={() => {
            setSheetOpen(false)
            requestAnimationFrame(() => {
              resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
          }}
        />
      )}
    </div>
  )
}

/** Appears once the first screen is behind you; sits clear of the mobile bar. */
function ScrollToTop({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="fixed bottom-[4.75rem] right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full
        border border-white/[0.1] bg-ink-900/90 text-slate-400 shadow-xl shadow-black/40 backdrop-blur
        transition hover:border-white/20 hover:text-white lg:bottom-6"
    >
      <Icon name="arrowUp" className="h-4 w-4" />
    </button>
  )
}

/**
 * A "no bugs found" state still has to convince. It shows the search effort,
 * the reference it compared against, and an explicit warning that a clean run
 * is weak evidence rather than proof of correctness.
 */
function CleanState({ report }: { report: AnalysisReport }) {
  return (
    <section className="panel-raised animate-fade-up p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
          <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-emerald-400 stroke-[2]">
            <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h3 className="text-sm font-semibold text-white">No disagreement found</h3>
      </div>

      <p className="text-[14px] leading-relaxed text-slate-400">
        <span className="font-medium text-amber-300/90">This is not a proof that your code is correct.</span>{' '}
        It means {report.stats.inputsTested.toLocaleString()} generated inputs agreed with{' '}
        <span className="text-slate-300">{report.oracle.signature}</span>. Passing inputs a
        generator produced is far weaker evidence than an input finding — bugs that need a very
        specific input still hide here.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4">
        <div>
          <p className="label mb-1">inputs tested</p>
          <p className="font-mono text-lg text-white">
            {report.stats.inputsTested.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="label mb-1">agreements</p>
          <p className="font-mono text-lg text-white">{report.stats.agreements.toLocaleString()}</p>
        </div>
      </div>
    </section>
  )
}

/**
 * The loop, closed.
 *
 * A plain clean scan and a clean retest after a fix are different events and
 * must not read the same. This names the witness the guard was applied to
 * close, shows a fresh search confirming nothing breaks the rule now, and
 * keeps the standard caveat: absence in a search is not a proof.
 *
 * It borrows CleanState's honest framing rather than inventing a victory
 * state, because "your fix worked" without the numbers behind it would be a
 * green checkmark with better marketing.
 */
function FixVerified({
  report,
  witness,
  onRevert,
}: {
  report: AnalysisReport
  witness: string
  onRevert: () => void
}) {
  return (
    <section className="panel-raised animate-fade-up border-emerald-500/20 p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
          <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-emerald-400 stroke-[2]">
            <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h3 className="text-sm font-semibold text-white">Your fix held</h3>
      </div>

      <code className="block break-words rounded-lg border border-white/[0.06] bg-ink-900/70 px-3.5 py-2.5 font-mono text-[13px] text-slate-200">
        {witness}
      </code>
      <p className="mt-3 text-[14px] leading-relaxed text-slate-400">
        That input broke the rule before the guard. A fresh search of{' '}
        {report.stats.inputsTested.toLocaleString()} inputs against{' '}
        <span className="text-slate-300">{report.oracle.signature}</span> found nothing that breaks it
        now. <span className="font-medium text-amber-300/90">This is not a proof of correctness</span>{' '}
        — only that this search did not defeat the guarded version.
      </p>

      <button
        type="button"
        onClick={onRevert}
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-300"
      >
        Revert the fix to see the bypass return
      </button>
    </section>
  )
}

function OracleMissing({ report }: { report: AnalysisReport }) {
  return (
    <section className="panel-raised animate-fade-up p-6">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15">
          <svg viewBox="0 0 16 16" className="mt-0.5 h-3 w-3 fill-none stroke-amber-400 stroke-[1.75]">
            <path d="M8 2.5v5.5M8 11.5h.01" strokeLinecap="round" />
            <circle cx="8" cy="8" r="6.25" />
          </svg>
        </span>
        <h3 className="text-sm font-semibold text-white">No reference implementation</h3>
      </div>

      <p className="text-[14px] leading-relaxed text-slate-400">
        {report.message ??
          'We could not obtain an independent implementation to compare against.'}
      </p>

      <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
        Add a one-line description of what the function should do, then run it again. Without a
        reference we can still catch crashes and infinite loops — but not a wrong answer.
      </p>
    </section>
  )
}

function RunningState() {
  const PHASES = [
    'reading your code',
    'inferring parameter types',
    'generating inputs',
    'running your function',
    'shrinking the failure',
    'checking the test catches mutants',
  ]

  return (
    <section className="panel-raised overflow-hidden p-6">
      <div className="mb-5 flex items-center gap-2.5">
        <svg viewBox="0 0 16 16" className="h-4 w-4 animate-spin fill-none stroke-rose-400 stroke-[2]">
          <circle cx="8" cy="8" r="6" strokeOpacity="0.2" />
          <path d="M14 8a6 6 0 00-6 6" strokeLinecap="round" />
        </svg>
        <h3 className="text-sm font-semibold text-white">Hunting for an input</h3>
      </div>

      <div className="relative h-1 overflow-hidden rounded-full bg-white/[0.05]">
        <div className="absolute inset-y-0 w-1/3 animate-scan rounded-full bg-gradient-to-r from-transparent via-rose-400 to-transparent" />
      </div>

      <ul className="mt-5 space-y-2">
        {PHASES.map((phase, i) => (
          <li
            key={phase}
            className="flex items-center gap-2.5 text-[13px] text-slate-500"
            style={{ animation: `fade-up 0.4s ease-out ${i * 90}ms both` }}
          >
            <span className="h-1 w-1 rounded-full bg-slate-600" />
            {phase}
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-slate-600">
        These are the stages this run passes through. They are shown in order, but the analysis is
        one request — what each stage actually produced is reported below, with its numbers, once
        the run finishes.
      </p>
    </section>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="panel-raised animate-fade-up border-rose-500/20 p-6">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/15">
          <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-rose-400 stroke-[2]">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" strokeLinecap="round" />
          </svg>
        </span>
        <h3 className="text-sm font-semibold text-white">Could not run the analysis</h3>
      </div>
      <p className="text-[14px] leading-relaxed text-slate-400">{message}</p>
    </section>
  )
}

function IdleState() {
  return (
    <section className="panel p-6">
      <h3 className="text-sm font-semibold text-white">How to use this</h3>
      <ol className="mt-4 space-y-3.5">
        {[
          'Paste a function, or load one of the seeded examples.',
          'We read the parameters, generate inputs biased toward boundaries, and compare against an independent implementation.',
          'You get the smallest input where the two disagree — plus a root cause and a proof that the test is meaningful.',
        ].map((step, i) => (
          <li key={step} className="flex gap-3 text-[13px] leading-relaxed text-slate-500">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/[0.08] font-mono text-[10px] text-slate-500">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 border-t border-white/[0.06] pt-4 text-[12px] leading-relaxed text-slate-600">
        Nothing is uploaded, stored or logged. Your code is analysed in memory and discarded when
        the request ends.
      </p>
    </section>
  )
}

/**
 * Footer links scroll instead of navigating to a hash. On a shared repro the URL
 * fragment carries the encoded case, and a plain anchor would quietly replace it
 * with `#gallery` — destroying the link the visitor arrived on.
 */
function Footer() {
  return (
    <footer data-footer="site" className="border-t border-white/[0.05]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">A2Z Cyber</p>
          <p className="mt-1 text-xs text-slate-600">
            Differential testing, counterexample shrinking and mutation analysis for JavaScript.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
          {NAV_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className="transition hover:text-slate-400"
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>
    </footer>
  )
}
