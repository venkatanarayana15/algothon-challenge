import { useCallback, useEffect, useRef, useState } from 'react'
import snapshot from './data/snapshot.json'
import type { AnalysisReport, Example, SnapshotEntry } from './types'
import { analyze, fetchExamples, RequestError } from './lib/api'
import { findPolicy } from './lib/policies'
import { Hero } from './components/Hero'
import { Editor } from './components/Editor'
import { Gallery } from './components/Gallery'
import { Pipeline, HonestLimits } from './components/Pipeline'
import { BenchmarkMatrix } from './components/BenchmarkMatrix'
import { CounterexampleCard } from './components/CounterexampleCard'
import { MutationPanel } from './components/MutationPanel'
import { ExplanationPanel } from './components/ExplanationPanel'

const DEFAULT_CODE = `// isPrime(n) -> boolean
// Classic example. It passes every test anyone would write by hand.
function isPrime(n) {
  if (n < 2) return true;
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false;
  }
  return true;
}`

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

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [spec, setSpec] = useState('')
  const [functionName, setFunctionName] = useState('')
  const [policyId, setPolicyId] = useState('')
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [examples, setExamples] = useState<Example[]>(SEEDED_EXAMPLES)
  const resultsRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Live examples from the API, with the static snapshot as an instant fallback.
  useEffect(() => {
    const controller = new AbortController()
    fetchExamples(controller.signal)
      .then((list) => list.length > 0 && setExamples(list))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const run = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsRunning(true)
    setError(null)
    setReport(null)

    try {
      const preset = findPolicy(policyId)
      const result = await analyze(
        {
          code,
          functionName: functionName.trim() || undefined,
          spec: spec.trim() || undefined,
          policy: preset
            ? { min: preset.min, max: preset.max, integer: preset.integer }
            : undefined,
        },
        controller.signal,
      )
      setReport(result)
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(
        err instanceof RequestError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setIsRunning(false)
    }
  }, [code, functionName, spec, policyId])

  const loadExample = useCallback((example: Example | SnapshotEntry) => {
    setCode(example.code)
    setSpec(example.spec ?? '')
    setFunctionName('')
    setPolicyId('')
    setReport(null)
    setError(null)
    requestAnimationFrame(() => {
      document.getElementById('try')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  return (
    <div className="relative z-10 min-h-screen">
      <Hero onPickEntry={loadExample} />

      <main id="try" className="mx-auto max-w-6xl scroll-mt-8 px-5 pb-20">
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
            onRun={run}
            onPickExample={loadExample}
            examples={examples}
            isRunning={isRunning}
          />

          <div ref={resultsRef} className="scroll-mt-8 space-y-4">
            {isRunning && <RunningState />}
            {error && <ErrorState message={error} />}

            {!isRunning && !error && report && (
              <>
                {report.status === 'counterexample-found' && report.finding && (
                  <>
                    <CounterexampleCard report={report} />
                    {report.mutationScore && <MutationPanel score={report.mutationScore} />}
                    {report.explanation && <ExplanationPanel explanation={report.explanation} />}
                  </>
                )}
                {report.status === 'no-counterexample-found' && <CleanState report={report} />}
                {report.status === 'oracle-missing' && <OracleMissing report={report} />}
              </>
            )}

            {!isRunning && !error && !report && <IdleState />}
          </div>
        </div>
      </main>

      <Gallery onPickEntry={loadExample} />
      <BenchmarkMatrix />
      <Pipeline />
      <HonestLimits />
      <Footer />
    </div>
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
        generator produced is far weaker evidence than a counterexample — bugs that need a very
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
        <h3 className="text-sm font-semibold text-white">Hunting for a counterexample</h3>
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

function Footer() {
  return (
    <footer className="border-t border-white/[0.05]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Counterexample</p>
          <p className="mt-1 text-xs text-slate-600">
            Differential testing, counterexample shrinking and mutation analysis for JavaScript.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
          <a href="#gallery" className="transition hover:text-slate-400">Gallery</a>
          <a href="#benchmark" className="transition hover:text-slate-400">Benchmark</a>
          <a href="#how" className="transition hover:text-slate-400">How it works</a>
          <a href="#try" className="transition hover:text-slate-400">Try it</a>
        </div>
      </div>
    </footer>
  )
}