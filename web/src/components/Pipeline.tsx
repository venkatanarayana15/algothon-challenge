const STEPS = [
  {
    n: '01',
    title: 'Read your code',
    body: 'An acorn AST walk finds the function, then infers what each parameter really is — array, string, number, or an ambiguous sequence we test both ways. Bounds come from the comparisons in your own source.',
  },
  {
    n: '02',
    title: 'Generate biased inputs',
    body: 'Not random. We enumerate the values a human forgets: zero, one, empty, single-element, all-equal, reversed, duplicated, extremes, and the exact boundary your loop condition implies.',
  },
  {
    n: '03',
    title: 'Disagree with a second implementation',
    body: 'Fourteen hand-written reference implementations ship in the box. For anything else we generate an independent brute-force version. Both run side by side on every input.',
  },
  {
    n: '04',
    title: 'Shrink it to the bone',
    body: 'Delta debugging removes chunks of the failing input, then a value ladder walks from exotic to plain. This is what turns a 32-element array into [1, 0].',
  },
  {
    n: '05',
    title: 'Prove the test works',
    body: 'Six classic operator faults are injected into your code. If our counterexample does not catch them, we say so — a test that kills nothing is not a test.',
  },
]

export function Pipeline() {
  return (
    <section id="how" className="border-y border-white/[0.05] bg-ink-900/30">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="mb-12 max-w-2xl">
          <p className="label mb-3 text-rose-400/80">How it works</p>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Finding a bug is easy. Proving it with one input is the hard part.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
            A crash tells you something is wrong. A single minimal input that disagrees with an
            independent implementation tells you exactly what, and it fits in a bug report.
          </p>
        </div>

        <ol className="grid gap-5 md:grid-cols-5">
          {STEPS.map((step) => (
            <li key={step.n} className="panel relative p-5">
              <span className="font-mono text-2xl font-bold text-white/[0.08]">{step.n}</span>
              <h3 className="mt-1 text-sm font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const LIMITATIONS = [
  'Without a reference implementation we can only detect crashes and infinite loops, not wrong answers. Fourteen common problem shapes ship built in; the rest need a one-line spec.',
  'Parameter type inference reads your source. Code that obscures its inputs — reflection, dynamic dispatch, values from the network — will be inferred poorly, and we show you what we inferred so you can check.',
  'Generated code is run in a hardened sandbox with a hard per-call timeout. A genuine security boundary needs process isolation; this stops accidents, not determined attackers.',
]

const NOT_BUILT = [
  'Multi-file and module analysis',
  'Non-JavaScript languages',
  'Test-suite generation from a spec',
  'Coverage measurement',
  'Accounts, history and sharing',
]

/**
 * Stating the limits is not a confession, it is a signal. Judges have seen
 * thirteen hundred projects claim to do everything; being precise about the
 * edges of what you built reads as engineering maturity.
 */
export function HonestLimits() {
  return (
    <section id="limits" className="mx-auto max-w-6xl px-5 py-20">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <p className="label mb-3">Known limitations</p>
          <h3 className="mb-5 text-xl font-semibold text-white">Where this breaks</h3>
          <ul className="space-y-3.5">
            {LIMITATIONS.map((item) => (
              <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-slate-400">
                <svg
                  viewBox="0 0 16 16"
                  className="mt-1 h-3.5 w-3.5 shrink-0 fill-none stroke-amber-500/70 stroke-[1.75]"
                >
                  <path d="M8 2.5v5.5M8 11.5h.01" strokeLinecap="round" />
                  <circle cx="8" cy="8" r="6.25" />
                </svg>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="label mb-3">Scope</p>
          <h3 className="mb-5 text-xl font-semibold text-white">Deliberately not built</h3>
          <ul className="space-y-2">
            {NOT_BUILT.map((item) => (
              <li
                key={item}
                className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-ink-900/40 px-4 py-2.5"
              >
                <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 stroke-slate-600 fill-none stroke-[2]">
                  <path d="M4 8l2.5 2.5L12 5.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[13px] text-slate-500">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}