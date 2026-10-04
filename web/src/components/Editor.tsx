import { useEffect, useRef, useState } from 'react'
import { CodeBlock } from './CodeBlock'
import { detectFunctionName } from '../lib/format'
import { POLICY_PRESETS } from '../lib/policies'
import type { Example } from '../types'

interface Props {
  code: string
  onCodeChange: (code: string) => void
  spec: string
  onSpecChange: (spec: string) => void
  functionName: string
  onFunctionNameChange: (name: string) => void
  policyId: string
  onPolicyIdChange: (id: string) => void
  onRun: () => void
  onPickExample: (example: Example) => void
  examples: Example[]
  isRunning: boolean
}

export function Editor({
  code,
  onCodeChange,
  spec,
  onSpecChange,
  functionName,
  onFunctionNameChange,
  policyId,
  onPolicyIdChange,
  onRun,
  onPickExample,
  examples,
  isRunning,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

  const lineCount = code.split('\n').length
  const charCount = code.length

  // Auto-fill the function name from the source while the user has not typed one.
  useEffect(() => {
    if (functionName.trim()) return
    const detected = detectFunctionName(code)
    if (detected) onFunctionNameChange(detected)
  }, [code, functionName, onFunctionNameChange])

  // Grow the textarea with its content so the panel never scrolls internally.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 200)}px`
  }, [code])

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab indents instead of moving focus; a real editor affordance.
    if (event.key === 'Tab') {
      event.preventDefault()
      const el = event.currentTarget
      const { selectionStart, selectionEnd } = el
      const next = `${code.slice(0, selectionStart)}  ${code.slice(selectionEnd)}`
      onCodeChange(next)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = selectionStart + 2
      })
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      onRun()
    }
  }

  return (
    <section className="panel-raised overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-ink-850/60 px-4 py-2.5">
        <div className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          <span className="ml-3 text-xs font-medium text-slate-500">solution.js</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5
                text-xs font-medium text-slate-400 transition hover:border-white/15 hover:text-slate-200"
            >
              Try an example
            </button>
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute right-0 z-20 mt-1.5 max-h-80 w-72 overflow-y-auto rounded-lg
                  border border-white/10 bg-ink-850 p-1.5 shadow-2xl shadow-black/60">
                  {examples.map((example) => (
                    <button
                      key={example.id}
                      type="button"
                      onClick={() => {
                        onPickExample(example)
                        setPickerOpen(false)
                      }}
                      className="block w-full rounded-md px-2.5 py-2 text-left transition hover:bg-white/[0.05]"
                    >
                      <span className="block truncate text-[13px] text-slate-200">{example.title}</span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
                        {example.counterexample}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5
              text-xs font-medium text-slate-400 transition hover:border-white/15 hover:text-slate-200"
          >
            Options
          </button>
        </div>
      </header>

      {showAdvanced && (
        <div className="grid gap-3 border-b border-white/[0.06] bg-ink-950/40 px-4 py-3 sm:grid-cols-2">
          <label className="block">
            <span className="label mb-1.5 block">Function to attack</span>
            <input
              type="text"
              value={functionName}
              onChange={(e) => onFunctionNameChange(e.target.value)}
              placeholder="detected automatically"
              className="w-full rounded-md border border-white/[0.08] bg-ink-900 px-2.5 py-1.5
                font-mono text-[13px] text-slate-200 outline-none transition
                placeholder:text-slate-600 focus:border-rose-500/40"
            />
          </label>

          <label className="block">
            <span className="label mb-1.5 block">Hold it to a rule (optional)</span>
            <select
              value={policyId}
              onChange={(e) => onPolicyIdChange(e.target.value)}
              className="w-full appearance-none rounded-md border border-white/[0.08] bg-ink-900 px-2.5 py-1.5
                text-[13px] text-slate-200 outline-none transition focus:border-rose-500/40"
            >
              <option value="">Detect automatically</option>
              {POLICY_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.hint}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="label mb-1.5 block">Task spec (optional)</span>
            <input
              type="text"
              value={spec}
              onChange={(e) => onSpecChange(e.target.value)}
              placeholder="What should this function do?"
              className="w-full rounded-md border border-white/[0.08] bg-ink-900 px-2.5 py-1.5
                text-[13px] text-slate-200 outline-none transition
                placeholder:text-slate-600 focus:border-rose-500/40"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-slate-600 sm:col-span-2">
            Validators are recognised on their own, so pasting one is usually enough — we look for
            inputs your check should have rejected but let through, which is how a{' '}
            <span className="text-slate-500">NaN</span> gets past a range test. Pick a rule only to
            force a specific range. A spec lets us generate a reference implementation for
            functions outside the built-in library.
          </p>
        </div>
      )}

      <div className="flex max-h-[26rem] overflow-y-auto">
        <div
          ref={gutterRef}
          aria-hidden
          className="shrink-0 select-none border-r border-white/[0.05] bg-ink-950/40 px-3 py-3
            text-right font-mono text-[11px] leading-[1.65rem] text-slate-700"
        >
          {Array.from({ length: Math.max(lineCount, 8) }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={'// Paste a function and we will find the input that breaks it.\nfunction isPrime(n) {\n  if (n < 2) return true;\n  for (let d = 2; d * d <= n; d++) {\n    if (n % d === 0) return false;\n  }\n  return true;\n}'}
          className="code-area min-h-[13rem] flex-1 px-4 py-3"
          aria-label="Function source code"
        />
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-ink-850/40 px-4 py-3">
        <span className="text-[11px] text-slate-600">
          {lineCount} lines · {charCount} chars · ⌘↵ to run
        </span>
        <button
          type="button"
          onClick={onRun}
          disabled={isRunning || !code.trim()}
          className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg
            bg-gradient-to-r from-rose-500 to-amber-400 px-4 py-2 text-sm font-semibold text-ink-950
            transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isRunning ? (
            <>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin fill-none stroke-current stroke-[2]">
                <circle cx="8" cy="8" r="6" strokeOpacity="0.25" />
                <path d="M14 8a6 6 0 00-6 6" strokeLinecap="round" />
              </svg>
              Hunting…
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2]">
                <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Find the counterexample
            </>
          )}
        </button>
      </footer>
    </section>
  )
}

export function EditorPreview({ code }: { code: string }) {
  return <CodeBlock code={code} showLineNumbers />
}