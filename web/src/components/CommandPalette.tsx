import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icons'

export interface PaletteAction {
  id: string
  label: string
  hint?: string
  group: string
  icon: string
  /** Extra text matched by the filter, beyond the label and hint. */
  keywords?: string
  disabled?: boolean
  run: () => void
}

interface Props {
  open: boolean
  actions: PaletteAction[]
  onClose: () => void
}

/**
 * ⌘K. On a single page with a gallery, a benchmark, an audit and sixteen seeded
 * examples, "scroll and squint" is a bad way to reach something you already
 * know the name of.
 *
 * Hand-rolled rather than a palette library for the same reason as the icons:
 * the feature is a filter, a list and a keyboard index, and that is smaller
 * than the dependency would be. Substring matching is intentional -- fuzzy
 * matching hides why a result ranked where it did, and in a tool aimed at
 * engineers a predictable filter beats a clever one.
 */
export function CommandPalette({ open, actions, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const scored = actions.map((action) => {
      if (!needle) return { action, empty: true }
      const haystack = `${action.label} ${action.hint ?? ''} ${action.group} ${action.keywords ?? ''}`.toLowerCase()
      return { action, empty: false, matches: haystack.includes(needle) }
    })
    return scored.filter((entry) => entry.empty || entry.matches).map((entry) => entry.action)
  }, [actions, query])

  // Group while preserving the flat order, so arrow keys walk exactly the list
  // the eye sees.
  const groups = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, PaletteAction[]>()
    for (const action of results) {
      if (!map.has(action.group)) {
        map.set(action.group, [])
        order.push(action.group)
      }
      map.get(action.group)!.push(action)
    }
    return order.map((name) => ({ name, items: map.get(name)! }))
  }, [results])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    // Focus after paint, otherwise the element is not yet mounted on the same tick.
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => setCursor(0), [query])

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  if (!open) return null

  const commit = (action: PaletteAction) => {
    if (action.disabled) return
    action.run()
    onClose()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((c) => (results.length === 0 ? 0 : (c + 1) % results.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((c) => (results.length === 0 ? 0 : (c - 1 + results.length) % results.length))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setCursor(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setCursor(Math.max(results.length - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const action = results[cursor]
      if (action) commit(action)
    }
  }

  let index = -1

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="panel-raised animate-fade-up relative w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <Icon name="search" className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a section, load an example, export the finding…"
            aria-label="Search commands"
            spellCheck={false}
            className="w-full bg-transparent text-[14px] text-slate-100 outline-none placeholder:text-slate-600"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.03] p-1 text-slate-500 transition hover:text-slate-200"
          >
            <Icon name="close" className="h-3 w-3" weight={2.2} />
          </button>
        </div>

        <div ref={listRef} className="max-h-[22rem] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-slate-600">
              Nothing matches “{query}”.
            </p>
          )}

          {groups.map((group) => (
            <div key={group.name} className="mb-1">
              <p className="label px-2.5 pb-1.5 pt-3">{group.name}</p>
              {group.items.map((action) => {
                index += 1
                const i = index
                const isCursor = i === cursor
                return (
                  <button
                    key={action.id}
                    type="button"
                    data-index={i}
                    disabled={action.disabled}
                    onMouseMove={() => setCursor(i)}
                    onClick={() => commit(action)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                      isCursor ? 'bg-white/[0.06]' : ''
                    } ${action.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                        isCursor
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                          : 'border-white/[0.07] bg-white/[0.02] text-slate-500'
                      }`}
                    >
                      <Icon name={action.icon} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-slate-200">{action.label}</span>
                      {action.hint && (
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
                          {action.hint}
                        </span>
                      )}
                    </span>
                    {isCursor && (
                      <kbd className="shrink-0 rounded border border-white/[0.1] bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                        ↵
                      </kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-ink-950/50 px-4 py-2.5 text-[11px] text-slate-600">
          <span>
            <kbd className="font-mono text-slate-500">↑↓</kbd> navigate ·{' '}
            <kbd className="font-mono text-slate-500">↵</kbd> select ·{' '}
            <kbd className="font-mono text-slate-500">esc</kbd> close
          </span>
          <span>{results.length} actions</span>
        </div>
      </div>
    </div>
  )
}
