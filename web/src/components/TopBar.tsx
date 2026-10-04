import { Icon } from './Icons'
import { scrollToSection } from '../lib/nav'
import type { EngineHealth } from '../lib/api'

interface Props {
  progress: number
  health: EngineHealth | null
  isRunning: boolean
  canRun: boolean
  onOpenPalette: () => void
  onRun: () => void
}

/**
 * A thin, always-present bar. It carries the three things a judge reaches for
 * while scrolling: where am I, is the engine up, and how do I run this thing.
 * The progress hairline is the cheapest possible answer to "how much is left".
 */
export function TopBar({ progress, health, isRunning, canRun, onOpenPalette, onRun }: Props) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-6">
        <button
          type="button"
          onClick={() => scrollToSection('overview')}
          data-action="brand"
          className="group flex shrink-0 items-center gap-2.5 rounded-lg px-1 py-1 transition"
          aria-label="Counterexample — back to top"
        >
          <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-rose-500 to-amber-400">
            <span className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_30%_20%,white,transparent_60%)]" />
            <Icon name="code" className="relative h-4 w-4 text-ink-950" weight={2.4} />
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className="text-[13px] font-semibold tracking-tight text-white transition group-hover:text-rose-200">
              Counterexample
            </span>
            <span className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 sm:block">
              differential tester
            </span>
          </span>
        </button>

        <span className="chip ml-1 hidden border-rose-500/30 bg-rose-500/10 text-rose-200 md:inline-flex">
          ALG-CYBER-02
        </span>

        <div className="ml-auto flex items-center gap-2">
          <EngineStatus health={health} />

          <button
            type="button"
            onClick={onOpenPalette}
            data-action="palette"
            className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5
              text-xs text-slate-400 transition hover:border-white/15 hover:text-slate-200"
            aria-label="Open the command palette"
          >
            <Icon name="search" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Jump to…</span>
            <kbd className="hidden rounded border border-white/[0.12] bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:inline">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={onRun}
            disabled={!canRun || isRunning}
            data-action="run"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-amber-400 px-3 py-1.5
              text-xs font-semibold text-ink-950 transition hover:brightness-110
              disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon
              name={isRunning ? 'flaky' : 'play'}
              className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`}
              weight={2}
              filled={!isRunning}
            />
            <span className="hidden sm:inline">{isRunning ? 'Hunting…' : 'Run analysis'}</span>
          </button>
        </div>
      </div>

      {/* Reading progress. Decorative, so it is hidden from assistive tech. */}
      <div className="absolute inset-x-0 -bottom-px h-px bg-transparent" aria-hidden="true">
        <div
          className="h-px bg-gradient-to-r from-rose-500 to-amber-400 transition-[width] duration-150 ease-out"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </header>
  )
}

/**
 * Says out loud whether a model key is configured, because the honest answer --
 * "none needed" -- is itself a selling point. A judge should not have to take
 * our word for it that the demo does not depend on a paid API.
 */
function EngineStatus({ health }: { health: EngineHealth | null }) {
  const state = health === null ? 'unknown' : health.ok ? 'up' : 'down'
  const dot =
    state === 'up' ? 'bg-emerald-400' : state === 'down' ? 'bg-rose-400' : 'bg-slate-500'

  const label =
    state === 'unknown'
      ? 'checking engine'
      : state === 'down'
        ? 'engine unreachable'
        : health?.llm
          ? `core: deterministic · optional LLM: ${health.llm}`
          : 'deterministic core · no API key'

  return (
    <span
      className="hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5
        text-[11px] text-slate-400 sm:inline-flex"
      title={label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="max-w-[15rem] truncate">{label}</span>
    </span>
  )
}
