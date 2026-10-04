import { Icon } from './Icons'
import { MOBILE_NAV_SECTIONS, scrollToSection } from '../lib/nav'

interface Props {
  active: string
}

/**
 * The thumb-reach bar for phones and small tablets.
 *
 * Five entries, icon plus label, because an unlabelled icon row is a guessing
 * game under time pressure. The padding is applied through
 * `env(safe-area-inset-bottom)` so the labels do not sit under an iPhone home
 * indicator, and the matching content padding lives on the page shell so the
 * last section is never trapped behind the bar.
 */
export function BottomNav({ active }: Props) {
  return (
    <nav
      aria-label="Sections"
      data-nav="bottom"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-950/95
        backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5">
        {MOBILE_NAV_SECTIONS.map((section) => {
          const isActive = active === section.id
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => scrollToSection(section.id)}
                aria-current={isActive ? 'true' : undefined}
                className="relative flex h-[3.75rem] w-full flex-col items-center justify-center gap-1 transition"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-4 top-0 h-[2px] rounded-full bg-rose-400 transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <Icon
                  name={section.icon}
                  className={`h-[1.15rem] w-[1.15rem] transition ${
                    isActive ? 'text-rose-300' : 'text-slate-500'
                  }`}
                  weight={isActive ? 2.1 : 1.7}
                />
                <span
                  className={`text-[10px] font-medium leading-none transition ${
                    isActive ? 'text-rose-200' : 'text-slate-500'
                  }`}
                >
                  {section.short}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
