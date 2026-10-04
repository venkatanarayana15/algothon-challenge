import { useMemo, useState } from 'react'
import { copyToClipboard } from '../lib/format'

interface Props {
  code: string
  showLineNumbers?: boolean
  className?: string
}

/**
 * Deliberately a regex highlighter rather than a full grammar engine: the
 * bundle cost of shiki/prism is not worth it for a code sample that is at most
 * twenty lines, and a hand-rolled pass keeps the first paint instant.
 */
function highlight(source: string): JSX.Element[] {
  const KEYWORDS = new Set([
    'function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
    'new', 'typeof', 'true', 'false', 'null', 'undefined', 'break', 'continue',
    'of', 'in', 'this', 'class', 'extends', 'try', 'catch', 'throw',
  ])

  const tokens: JSX.Element[] = []
  const pattern =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][A-Za-z0-9_$]*\b)|([{}()[\];,.])|([+\-*/%<>=!&|?]+)/g

  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null

  const push = (text: string, className?: string) => {
    if (!text) return
    tokens.push(
      className ? (
        <span key={key++} className={className}>{text}</span>
      ) : (
        <span key={key++}>{text}</span>
      ),
    )
  }

  while ((match = pattern.exec(source)) !== null) {
    push(source.slice(lastIndex, match.index))
    const [, comment, string, number, word, punctuation, operator] = match

    if (comment) push(comment, 'text-slate-600 italic')
    else if (string) push(string, 'text-emerald-300')
    else if (number) push(number, 'text-amber-300')
    else if (word) push(word, KEYWORDS.has(word) ? 'text-sky-300' : 'text-slate-200')
    else if (punctuation) push(punctuation, 'text-slate-500')
    else if (operator) push(operator, 'text-rose-300')

    lastIndex = pattern.lastIndex
  }
  push(source.slice(lastIndex))
  return tokens
}

export function CodeBlock({ code, showLineNumbers = false, className = '' }: Props) {
  const [copied, setCopied] = useState(false)
  const tokens = useMemo(() => highlight(code), [code])
  const lineCount = code.split('\n').length

  const handleCopy = async () => {
    if (await copyToClipboard(code)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <div className={`group relative ${className}`}>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy code"
        className="absolute right-2 top-2 z-10 rounded-md border border-white/10 bg-ink-800/90 p-1.5
          text-slate-500 opacity-0 transition hover:text-slate-200 focus:opacity-100 group-hover:opacity-100"
      >
        {copied ? (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-emerald-400 stroke-[1.75]">
            <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.5]">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 3.5h-7a1 1 0 00-1 1v7" strokeLinecap="round" />
          </svg>
        )}
      </button>

      <div className="flex overflow-x-auto">
        {showLineNumbers && (
          <div
            aria-hidden
            className="select-none border-r border-white/[0.05] px-3 py-3 text-right font-mono text-[11px] leading-[1.65] text-slate-700"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        <pre className="min-w-0 flex-1 px-4 py-3 font-mono text-[13px] leading-[1.65]">
          <code>{tokens}</code>
        </pre>
      </div>
    </div>
  )
}