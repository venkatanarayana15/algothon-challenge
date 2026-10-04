import { useEffect, useRef } from 'react'
import { Icon } from './Icons'

interface Props {
  onClose: () => void
}

const IS_APPLE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** ⌘ on a Mac and Ctrl everywhere else, so the sheet is never wrong. */
const mod = (letter: string) => (IS_APPLE ? `⌘${letter}` : `Ctrl+${letter}`)

const GROUPS: { title: string; items: { keys: string[]; what: string }[] }[] = [
  {
    title: 'Anywhere',
    items: [
      { keys: [mod('K')], what: 'Open the command palette — jump anywhere, load any example' },
      { keys: [mod('Enter')], what: 'Run the analysis on the current code' },
      { keys: ['?'], what: 'Show or hide this list' },
      { keys: ['Esc'], what: 'Close whatever is open' },
    ],
  },
  {
    title: 'The demo',
    items: [
      { keys: ['⇧', 'D'], what: 'Load the validation-bypass case and find it' },
      { keys: ['Tab'], what: 'Move between controls — every one shows a focus ring' },
    ],
  },
]

/**
 * The shortcut sheet.
 *
 * The app has grown four global shortcuts, and none of them are discoverable by
 * looking at the page. A keyboard user who cannot find them simply concludes
 * the app has no keyboard support, which is the wrong impression twice over.
 *
 * Rendered as a real dialog with a focus trap and Escape-to-close, because a
 * modal that leaks focus to the page behind it is worse than no modal.
 */
export function ShortcutsDialog({ onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Move focus into the dialog so Tab cycles inside it rather than escaping
    // to the page behind, and put it back where it was on close.
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return

      const focusable = panel.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        tabIndex={-1}
        className="panel-raised animate-fade-up w-full max-w-lg p-6 outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="shortcuts-title" className="text-base font-semibold text-white">
              Keyboard shortcuts
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              The whole app is reachable without a mouse.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-white/[0.08] p-1.5 text-slate-500 transition hover:text-slate-200"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>

        {GROUPS.map((group) => (
          <div key={group.title} className="mb-5 last:mb-0">
            <p className="label mb-2.5">{group.title}</p>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li key={item.what} className="flex items-center justify-between gap-4">
                  <span className="text-[13px] leading-snug text-slate-400">{item.what}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-300"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}