# Counterexample

**Paste your code. Get the smallest input that breaks it.**

<!-- ALGOTHON'26 · Problem Statement ALG-CYBER-02 — Secure the Application -->

[![CI](./actions/workflows/ci.yml/badge.svg)](./actions/workflows/ci.yml)

Counterexample is an adversarial tester for JavaScript functions. You paste a
function; it runs a second, independent implementation alongside yours over
thousands of generated inputs, and hands you the smallest input where the two
disagree. The second implementation ships with the tool for the common cases —
a model key is optional, not required.

```js
function isPrime(n) {
  if (n < 2) return true;          // <- the bug
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false;
  }
  return true;
}
```

```
counterexample   isPrime(-1)
returned         true
expected         false
```

No signup. No file upload. No API key. No database. About two seconds.

**Measured:** 95% of real bugs detected, 0% false positives against correct
controls, across 21 seeded defects and 9 correct implementations.

---

## Deploy

The whole app is one Node process — Express serves the API and the built static
bundle from the same port, so there is no separate frontend host to configure.

```bash
npm ci && npm run build && npm start   # single process on $PORT
```

`render.yaml` is included: push the repo and create a Render Blueprint, or use
the dashboard's deploy button. On first start the app answers `/api/health`,
which doubles as the platform health check.

The engine executes untrusted JavaScript server-side, so **static hosting will
not work** — Vercel's static tier, Netlify Pages and S3 all lack a runtime.
Render, Fly, Railway, a VPS or Cloudflare Workers with Node compatibility are the
options that do.

---

## The problem

Every developer writes tests for the inputs they imagined. The bugs live in the
inputs nobody did.

This matters more in 2026 than it ever has, because most shipped code is now
AI-generated. The dominant failure mode is no longer "the code throws" — it is
"the code returns a confident, plausible, wrong answer on the one input that
mattered." Independent evaluations of LLM-generated patches keep finding the
same thing: a meaningful share of solutions that pass an official test suite
are functionally broken when you run the full battery, and roughly half of what
benchmarks accept would be rejected by real maintainers.

Code review does not catch these. Every individual line in an off-by-one is
defensible. The bug only exists in the composition.

## How it works

| Stage | What happens |
|---|---|
| **Parse** | An `acorn` AST walk locates the target function and infers what each parameter actually is. |
| **Infer** | Types come from evidence in your source: method calls, `.length` reads, index accesses, arithmetic, comparisons, `Set`/`Map` construction, JSDoc. Bounds are read off your own comparison operators. |
| **Generate** | Biased input generation, not random fuzzing. Boundary values a human forgets — `0`, `1`, empty, single-element, all-equal, sorted, reversed, duplicated, `MAX_SAFE_INTEGER`, unicode — plus the exact values implied by your loop bounds. |
| **Oracle** | Fourteen hand-written reference implementations ship in the box, covering common problem shapes. Validators are checked against an explicit policy instead of an output — see below. Anything outside the library is only covered when a model key is configured; without one we report crashes and hangs rather than guessing at an answer. |
| **Differentially fuzz** | Both implementations run on every input under a per-call timeout, catching four distinct failure classes: wrong answers, exceptions, non-termination, and non-determinism. |
| **Shrink** | Delta debugging (ddmin) removes chunks of the failing input; a value ladder then walks from exotic to plain, keeping the plainest value that still reproduces. |
| **Classify** | The *kind* of mistake is named from the shape of the counterexample and your source, with the fix to look at. Heuristic, and labelled as such in the UI. |
| **Verify** | Six classic operator faults are injected into your code. If the counterexample does not kill them, we say so. |

## Results

### What it catches, measured

A labelled suite of **21 real defects and 9 deliberately correct
implementations**, run end to end (`npm run benchmark`):

| Metric | Result |
|---|---|
| Detection rate | **95%** (20 of 21 real bugs found) |
| False positive rate | **0%** (0 of 9 correct implementations flagged) |
| Bug-class naming | 70% — heuristic, reported as such |
| Median analysis | ~2.2s over 75,000 generated inputs |

Per class, detection ranges from 67% to 100% across the twelve classes the suite
covers (thirteen are registered; one has no benchmark case yet). The one miss is
`max-with-nan`, where a `>=` comparison silently `NaN`-discards the maximum — it
is left in the reported table rather than removed.

The controls are the point. A fuzzer that flags everything detects everything;
a detection rate without a false-positive rate is a claim rather than a
measurement. Nine correct implementations — a proper Euclidean GCD, a correct
primality test, insertion-ordered dedup — are included precisely so that
over-reporting shows up as a failure.

Two "controls" were initially labelled correct and turned out not to be:
`isPrime(Infinity)` genuinely fails to terminate, and `fib(true)` has a
type-confusion bug. Both were relabelled as bugs, because a benchmark label
that disagrees with reality is worse than no label at all.

### The ALG-CYBER-02 audit, and a test you can run

`npm run audit` audits a deliberately vulnerable application: three findings,
each detected, patched, retested, and checked against legitimate behaviour.
All three reach `FIXED_AND_VERIFIED`, with **12/12 legitimate cases passing
before and after** and nothing broken by the fixes.

| Finding | Attack | Before | After |
|---|---|---|---|
| V1 `validateQty` accepts `NaN` | `validateQty(NaN)` | accepted | rejected |
| V2 `isStrongEnoughPassword` ReDoS | `aaa…A1!` | hung — 1500ms budget exhausted | returned in ~0.1ms |
| V3 `authorize` inverted comparison | `authorize("user", 0)` | accepted | rejected |

The engine finds V1 by itself. V2 and V3 need knowledge a fuzzer does not have
— a backtracking trigger, an inverted predicate — so they are confirmed against a
supplied attack, which is how real testing works: the auditor brings the case.

The deliverable is a file you can execute:

```bash
npm run regression-test        # writes security-regression.test.mjs
node --test security-regression.test.mjs
```

It is a standard `node:test` suite — nothing to install — with 3 finding tests
and 12 legitimate-behaviour tests. **It asserts the fixed behaviour, so it fails
against the vulnerable version**, and `npm run verify:regression-test` proves
both halves by swapping the fixes back out:

```
ok   patched source: 15 passing
ok   vulnerable source: 3 failing (one per finding)
ok   all 12 legitimate-behaviour tests stay green against vulnerable code
ok   the committed suite matches what the audit generates today
```

That third line is the one that matters. A "fix" that closed the vulnerability by
breaking valid input would fail it — which is the half of a security fix that is
usually skipped.

The last line keeps the checked-in copy honest. The suite is committed so a
reviewer can read it without running anything, which only helps if it still
matches the code; `verify:regression-test` regenerates and fails if it drifted.
That check is only possible because the generator states verdicts rather than
measured milliseconds, so its output is byte-stable across runs.

### The seeded gallery

The thirteen general submissions below, each verified against the real engine
(`npm run selftest`). The gallery in the app also leads with three security
validators, so it shows sixteen cards. Every counterexample below was found by
the tool, not written by hand.

| Submission | Counterexample | Returned | Expected | Inputs | Mutants killed |
|---|---|---|---|---|---|
| Fibonacci, missing base case | `fib(-1)` | timeout | `1` | 1,695 | — |
| Primality, inverted guard | `isPrime(-1)` | `true` | `false` | 918 | 1/1 |
| GCD, negative operands | `gcd(-1, 0)` | `0` | `1` | 4,000 | 1/1 |
| Sum, seeded from input | `sum([])` | `undefined` | `0` | 4,000 | 2/2 |
| Maximum, uninitialised sentinel | `max([])` | `-Infinity` | `undefined` | 4,000 | 3/3 |
| Second largest, ignores duplicates | `secondLargest([Infinity, Infinity])` | `Infinity` | `null` | 4,000 | 4/4 |
| Reverse, off-by-one loop bound | `reverseString("u")` | `""` | `"u"` | 4,000 | 1/4 |
| Vowel count, shifted index | `countVowels(" ")` | throws | `0` | 4,000 | 1/2 |
| Rotation, naive modulo | `rotateRight([1, 0], -1)` | `[0, 1]` | `[1, 0]` | 4,000 | — |
| Sorted check, inverted predicate | `isSorted([1, 0])` | `false` | `true` | 4,000 | 2/2 |
| Dedupe, ordering contract broken | `removeDuplicates([1, 0])` | `[0, 1]` | `[1, 0]` | 4,000 | — |
| Binary search, shifted index | `binarySearch([1], 1)` | `1` | `0` | 4,000 | 2/2 |
| **Real-world shape** | `indexOfTarget([1, 1], 1)` | `1` | `0` | 4,000 | 2/2 |

45,468 generated inputs across the gallery. The full report for each, including
the root cause and the fix, is on the site and in `web/src/data/snapshot.json`.

## Running it

```bash
npm install
npm run dev        # api on :3001, web on :5173
npm run build      # static bundle into dist/
npm start          # single process, serves api + web on :3001

npm run selftest   # 19 checks: 13 counterexamples, 3 bypasses, 3 clean validators
npm run benchmark  # detection rate, false positives, class accuracy
npm run check:data # fails if web/src/data is out of date
npm run audit      # the CYBER-02 arc: find, fix, retest, regression
npm run test:e2e   # 33 checks against the running product over HTTP

npm run regression-test          # writes security-regression.test.mjs
npm run verify:regression-test   # proves it goes red on the vulnerable code
```

`npm start` serves the built bundle, so run `npm run build` first or every route
returns 404 — `dist/` is gitignored, so a fresh clone does not have it. `npm run
test:e2e` boots that same server on its own port, so run it after a build too.

Every verification command prints a table and exits non-zero on failure.

The five checks are deliberately different from each other, because passing one
says nothing about the others:

| Command | What it actually proves |
| --- | --- |
| `selftest` | The **engine** finds the counterexamples it is seeded with. |
| `benchmark` | The engine's **rates** over a 30-case corpus, false positives included. |
| `check:data` | The **site's data** still matches what the engine produces today. |
| `audit` | The **fix-and-retest arc**: every finding patched, every legitimate case still passing. |
| `test:e2e` | The **shipped product** over HTTP — the bundle, the failure paths, the whole CYBER-02 arc. |
| `verify:regression-test` | That the generated suite is a **real** regression test: green on the fix, red on the bug, and not stale. |

`.github/workflows/ci.yml` runs all six — typecheck, the self-test, the
benchmark, the audit, the build, the staleness check on the generated data, and
the end-to-end run against the built bundle. The staleness step regenerates
`web/src/data/` and fails if anything reproducible moved, so the site can never
quietly show a finding the engine no longer produces.

Both generated files are stable enough to check in, but they are not byte-for-byte
reproducible, and the staleness check does not pretend otherwise. It compares the
fields an honest run can reproduce — every rate, every verdict, every classification
— and explicitly excludes three that vary by design: wall-clock timing, input counts,
and the observation fields of the deliberately non-deterministic benchmark case,
whose subject injects `Math.random` and so returns a different minimal input on
each run. Anything else moving fails the build.

## Finding your way around the submission

The site is a single page, but it is not a single scroll. A fixed top bar carries
the brand, a live engine-status pill, a reading-progress hairline and the run
action; on desktop a side rail lists every section with a one-line description
and tracks your position; on phones and small tablets a five-item bottom bar sits
inside the safe area so it never collides with a home indicator. One shared
section model drives all three, so a section cannot be listed in one place and
missing from another.

| Shortcut | Does |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette: jump to any section, load any seeded case, run the analysis, export the finding |
| `⌘↵` / `Ctrl+↵` | Run the analysis from anywhere |
| `⇧D` | The one-click demo — loads the NaN validation bypass and finds it live |
| `Tab` / `Esc` | Indent inside the editor; close the palette |

Two things are worth calling out because they are aimed at whoever has to
*receive* a finding, not just produce it:

- **A repro permalink.** “Share this repro” encodes the code, the spec and the
  selected rule into the URL fragment. Opening the link re-runs the analysis
  automatically, so the recipient lands on the same counterexample without typing.
  The run is strictly client-side decode plus one normal analysis request.
- **Evidence export.** The same report becomes a paste-ready regression
  assertion, a Markdown write-up (subject, minimal counterexample, reference
  implementation, root cause, mutation check) or a JSON record. The assertion is
  the part that turns a demo into a guard that fails in CI.

The app ships a web app manifest and icons, so it installs to a phone home
screen and opens without browser chrome — useful when the venue wifi is worse
than the phone's data connection.

### Closing the loop inside the tool

The problem statement's workflow is identify → demonstrate safely → fix → retest
→ document. The audit panel proves that loop on a bundled target; the main tool
now does the same loop on *your* code:

- **Triage on every finding.** A severity, plus an OWASP Top 10 category or a
  CWE id where one genuinely applies. Classes with no honest CWE mapping get
  none, and `lib/security.ts` states the rule it follows rather than padding the
  list.
- **A one-line fix, shown before it is applied.** For a numeric validation
  bypass the tool composes the guard
  `if (typeof q !== 'number' || !Number.isFinite(q)) return <your own rejection value>;`.
  It reuses the author's own rejection statement instead of inventing one, and
  declines to suggest anything when the function has no convention to borrow or
  when the engine reports the parameter's source already checks finiteness.
- **Apply the guard and retest.** One click inserts the guard and immediately re-runs the
  analysis, so “fixed” is the next result on screen rather than a claim.
  *Revert* restores the original source so the bypass can be reproduced again.
- **A verification trail.** Every run is listed in order with its outcome, and a
  **fixed and verified** banner appears only once the trail actually contains a
  bypass followed by a clean run on the changed code — the retest is the
  evidence, not the badge.

## Finding a validation bypass

A validator is the security case, and it needs a different comparison. A validator
does not have a right answer, it has a verdict, so there is no reference "error
message for input q" to disagree with. Counterexample instead takes the *policy* —
the rule you meant to enforce — and reports any input where your validator's
verdict disagrees with it:

```js
function validateQty(q) {
  if (q <= 0) return "must be positive";
  if (q > 100) return "too large";
  return null;
}
```

```
counterexample   validateQty(NaN)
policy           reject
your validator   accept
```

`NaN <= 0` is false and `NaN > 100` is false, so the range check passes it.
`true`, `null` and `""` do the same thing. There is not one bug here but a family
of them, which is why the reported input can differ between runs; every one of them
is a genuine bypass. A correctly written validator produces no finding at all,
which is the property that matters — a security tool that flags everything is worse
than no tool.

The policy is stated explicitly rather than inferred from your source. In
`if (q <= 0) return "must be positive"` those comparisons are *rejection* guards,
so reading them as acceptance bounds inverts the rule and would produce a reference
that accuses correct validators. Guessing a security policy from the code it is
meant to police is the wrong direction of trust.

### Setting a model key (optional)

The deterministic core needs nothing. A free-tier key adds two things: an
independent oracle for functions outside the built-in library, and a written
root-cause explanation. Set any one of these and it is picked up automatically:

```bash
GEMINI_API_KEY=...   # preferred
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
```

Without a key the tool still finds crashes, timeouts and every bug covered by
the built-in oracle library, and falls back to pattern-matched explanations.

## Architecture

```
browser ──POST /api/analyze──▶ Express
                                  │
                                  ├─ analyze.js     locate function, infer param schemas (acorn)
                                  ├─ generator.js   boundary-biased input generation
                                  ├─ oracles.js     built-in references, or model-synthesised
                                  ├─ sandbox.js     hardened node:vm, per-call timeout
                                  ├─ shrinker.js    ddmin + plainest-value ladder
                                  ├─ classify.js    name the bug class
                                  └─ llm.js         mutation score, explanation (optional)
```

See `ARCHITECTURE.md` for the design decisions and the four bugs found while
building it.

## What this does not do

- **No proof of correctness.** Finding no counterexample is weak evidence, not
  a guarantee. The UI says so explicitly rather than showing a green checkmark.
- **Single-file JavaScript.** No modules, no multi-file projects, no other
  languages.
- **Validator policies are numeric ranges.** Bypass detection covers range and type
  checks, which is where the coercion bugs live. Regex, string-shape and
  cross-field rules need a policy written for them; we do not infer one.
- **Type inference reads your source.** Code that hides its inputs —
  reflection, dynamic dispatch, network data — is inferred poorly. We always
  display what we inferred so you can check it.
- **The sandbox is not a security boundary.** Hardened `node:vm` with frozen
  intrinsics and hard timeouts stops accidents and runaway loops. A determined
  attacker would need process isolation to be contained, which is out of scope
  for a submission box.

## Deliberately not built

Test-suite generation from a spec · coverage measurement · accounts, history
and sharing · non-JavaScript languages · multi-file analysis.

## Disclosure

Stated plainly, because it is asked for and because the demo depends on it.

**External APIs — none required, three optional.** The deterministic core calls
no external service: no network request is made to analyse a function, and the
demo works with every key unset (verified in CI and from a clean clone). Three
optional free-tier model providers are supported — Gemini, Groq, OpenRouter —
and are used only if you supply a key, for an extra independent oracle on
functions outside the built-in library and for a written root-cause sentence.
The first key found wins; the tool degrades to heuristics when none is present.

**Datasets — none.** No external dataset is used, downloaded, or bundled. Every
seeded example, benchmark case and oracle is hand-written for this project. The
two generated files in `web/src/data/` (`snapshot.json`, `benchmark.json`) are
produced by running *this* engine over *these* seeded cases; CI regenerates them
and fails if anything reproducible changes.

**AI-assisted components.** The engine, the oracles, the benchmarks, the web UI
and the documentation were written by hand. The codebase contains no generated or
copied model output. A model can optionally be consulted at runtime for an
oracle or a sentence of prose, as described above — never for detection,
classification or any number reported in the benchmark.

**Third-party code.** Runtime dependencies are `express`, `acorn` and
`acorn-walk`. The front end is built with `react`, `react-dom`, `vite`,
`typescript` and `tailwindcss`. Input generation, the sandbox, the shrinker, the
oracle library and the benchmark suite are all first-party.

## Why differential testing

Property-based testing needs an oracle, and "the expected output" is the hard
part. Without one you can only detect crashes, which finds a small fraction of
real bugs. Comparing two independent implementations removes the oracle
requirement entirely — that is the trick this whole tool is built on, and it is
why an unsophisticated second implementation beats a sophisticated one: it has
to be *correct*, not clever.