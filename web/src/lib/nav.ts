/**
 * The single source of truth for navigation.
 *
 * The top bar, the side rail, the mobile bottom bar and the command palette all
 * read from this list, so a section can never appear in one and be missing from
 * another. Order here is document order — the scroll-spy walks it the same way.
 */
export interface NavSection {
  /** DOM id of the section element. */
  id: string
  label: string
  /** Short label for the width-constrained mobile bar. */
  short: string
  /** One-line description, used by the side rail and the palette. */
  hint: string
  /** Icon name from `components/Icons`. */
  icon: string
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    short: 'Top',
    hint: 'What A2Z Cyber does, in one screen',
    icon: 'overview',
  },
  {
    id: 'try',
    label: 'Try it',
    short: 'Try',
    hint: 'Paste a function, get the input that breaks it',
    icon: 'try',
  },
  {
    id: 'audit',
    label: 'Security audit',
    short: 'Audit',
    hint: 'ALG-CYBER-02: find it, fix it, prove the fix held',
    icon: 'audit',
  },
  {
    id: 'gallery',
    label: 'Gallery',
    short: 'Gallery',
    hint: 'Real bugs with the exact input that triggers each one',
    icon: 'gallery',
  },
  {
    id: 'benchmark',
    label: 'Benchmark',
    short: 'Bench',
    hint: 'Detection and false-positive rates, measured',
    icon: 'benchmark',
  },
  {
    id: 'how',
    label: 'How it works',
    short: 'How',
    hint: 'The five-stage pipeline, start to finish',
    icon: 'how',
  },
  {
    id: 'limits',
    label: 'Limits',
    short: 'Limits',
    hint: 'Where this breaks, and what is deliberately not built',
    icon: 'limits',
  },
]

export const NAV_IDS = NAV_SECTIONS.map((section) => section.id)

/** Five is the most a thumb-reachable bar can hold without becoming a menu. */
export const MOBILE_NAV_SECTIONS = NAV_SECTIONS.filter((section) =>
  ['audit', 'try', 'gallery', 'benchmark', 'how'].includes(section.id),
)

/** Smooth-scroll to a section, respecting the fixed top bar via scroll-padding. */
export function scrollToSection(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
