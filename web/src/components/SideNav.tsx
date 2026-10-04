import { Icon } from './Icons'
import { NAV_SECTIONS, scrollToSection } from '../lib/nav'

interface Props {
  active: string
}

/**
 * The desktop rail. It shows the whole document at a glance, which matters on a
 * submission where the ordering of the argument is part of the argument: audit
 * first, then the tool, then the evidence, then the limits.
 *
 * Every entry carries its own one-line description, so a judge who is skimming
 * can decide where to go without scrolling to find out what a heading means.
 */
export function SideNav({ active }: Props) {
  return (
    <nav
      aria-label="Sections"
      data-nav="rail"
      className="fixed bottom-0 left-0 top-14 z-30 hidden w-60 flex-col border-r border-white/[0.06]
        bg-ink-950/50 px-3 py-5 backdrop-blur-sm lg:flex"
    >
      <p className="label px-3 pb-3">On this page</p>

      <ul className="space-y-0.5">
        {NAV_SECTIONS.map((section) => {
          const isActive = active === section.id
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => scrollToSection(section.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`group relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                  isActive ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-rose-400 transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <Icon
                  name={section.icon}
                  className={`mt-0.5 h-4 w-4 shrink-0 transition ${
                    isActive ? 'text-rose-300' : 'text-slate-500 group-hover:text-slate-400'
                  }`}
                />
                <span className="min-w-0">
                  <span
                    className={`block text-[13px] font-medium transition ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    {section.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">
                    {section.hint}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto border-t border-white/[0.06] pt-4">
        <p className="label mb-2.5 px-3">Shortcuts</p>
        <ul className="space-y-1.5 px-3 text-[11px] text-slate-600">
          <Shortcut keys="⌘K" label="jump to anything" />
          <Shortcut keys="⌘↵" label="run the analysis" />
          <Shortcut keys="⇧D" label="run the demo" />
        </ul>
      </div>
    </nav>
  )
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <kbd className="rounded border border-white/[0.1] bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
        {keys}
      </kbd>
    </li>
  )
}
