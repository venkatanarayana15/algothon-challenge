# ALGOTHON'26 — Deep Strategy for Winning

> **Internal planning document. Superseded — read `plan.md` instead.**
>
> This was written before the problem statements were published and before the
> product was built, so parts of it describe a system that does not exist. It is
> kept because the reasoning is real, but the factual claims about the shipped
> product have been corrected where they were wrong.
>
> What changed after this was written:
>
> - The organiser published **12 problem statements with IDs**. We build against
>   **ALG-CYBER-02, Secure the Application**. See `plan.md`.
> - Analysis runs **server-side in a hardened `node:vm`**, not in the browser. There
>   is no WASM build and no Pyodide.
> - The oracles are a **hand-written library of 14** shipped in the source, not a
>   disk cache of about 20.
> - **No unified-diff fixer was built.** Explanations are prose plus a class-level
>   recommendation.
> - Only **JavaScript** is supported, never Python.
> - Benchmarked: **95% detection, 0% false positives** over 21 defects and 9
>   correct controls. The 300-registration figure is an organiser claim, not a
>   verified number.

## 0. What kind of competition this actually is (read this first)

Facts extracted from the case file + public listing:

| Property | Value | Strategic consequence |
|---|---|---|
| Theme | ~~None published.~~ **Superseded:** 12 problem statements were published with unique PS IDs across 6 domains. | You pick one PS ID and build against it. We picked ALG-CYBER-02. |
| Participants | **300+ registered** (organizer's own post), mostly students/beginners. | The bar is NOT "most technically advanced". The bar is "clearly better than 300 chatbot wrappers and half-broken CRUD apps". |
| Format | 12h, online, solo or team of 2, one submission. | Team of 2 is strictly better if available — halves the build, adds a second brain. |
| Judges | Algoxilla organizers (algo-themed student/dev community). | They reward **algorithmic depth + execution**. Avoid generic AI wrappers. |
| Judging | problem understanding, functionality, technical implementation, originality, usability, execution, completeness, overall quality | 8 fuzzy criteria → optimize the *union*, and make each one **visible without effort**. |
| Evaluation | 4–5 Oct, i.e. **asynchronous review of links**, not a live pitch. | Judges will skim 100+ links in a browser tab. **Your demo must sell itself in 15 seconds with zero setup.** |
| Prizes | Laptop stand, mouse, tumbler, pomodoro timer | Budget is small → judges are hobbyist/mentor volunteers, not professionals. They reward *wow + polish*, not enterprise architecture. |

### The single most important deduction
This is an **asynchronous, high-volume, low-stakes-for-judges** review. Three consequences decide the winner:

1. **A live, working URL is not optional.** A repo link with a screenshot dies instantly against a live demo.
2. **The winning artifact is the demo, not the README.** Any friction (sign-up, API key, upload, 30s load) is a fatal score drop because the judge has no patience.
3. **Originality beats complexity.** Judges see 300 submissions. The median one is "AI chatbot + CRUD + Tailwind". Beating that needs one *unforgettable* moment, not 15 features.

Corollary rule: **your app must be interesting when used with zero setup and zero API keys.**

---

## 1. Candidate ideas — evaluated, then killed

I generated and scored candidates on: 15-second demo impact, technical depth, originality vs. 300 competitors, 12h solo feasibility, zero-cost/zero-API-key reliability, India relevance.

### KILLED: generic AI wrappers (the 300-submission cluster)
- "AI study assistant", "AI notes summarizer", "AI interview prep chatbot", "RAG over my notes", "AI code explainer", "AI career counselor".
- **Why killed:** zero originality, judges have seen 100 of these, differentiation is impossible, and every one of them needs an LLM API key → demo breakage risk at judging time.

### KILLED: heavy infrastructure projects
- Distributed systems, custom compiler/interpreter, full blockchain chain, an OS, a from-scratch database, a mobile app with 10 native screens.
- **Why killed:** 12h. You will submit something that half-works. "Half-works" scores zero on *execution* and *completeness*, which together are half the rubric.

### SHORTLISTED (ranked)

**#1 — Adversarial Test-Case Hunter for code/DSA solutions** ⭐ recommended
Paste any JavaScript function → the tool *finds a concrete input that breaks it*, with a minimal counterexample, server-side, in ~15 seconds.
- Demo impact: **10/10.** The judge pastes *their own* code and watches it get killed. Self-referential, personal, addictive.
- Originality: **10/10.** Essentially nobody builds this at hackathons.
- Fit to Algoxilla (algo community): **perfect.**
- Feasibility 12h solo: **9/10** (core is a test harness + fuzzer + shrinker; UI is one page).
- Reliability: **10/10** if it runs client-side in Pyodide/WebAssembly — static site, no server, no keys, cannot go down.
- See §2 for full design.

**#2 — Government-scheme eligibility explainer (India)**
"Am I eligible for X? Paste your details → get a verdict with the exact criterion you failed, and the document line it came from."
- Impact: **9/10**, India relevance **10/10**, demo clarity **9/10**.
- Originality: **8/10** (some schemes engines exist, very few are explainable + LLM-extracted from PDFs).
- Feasibility: **8/10** — rule engine + PDF extraction for ~6 real schemes, hardcode as data.
- Risk: judges may see it as "just a lookup form"; needs depth (rule DSL, explanation trace, counterfactual: "change this one field and you qualify").
- Strong backup if the announced theme is social-impact / India / GovTech.

**#3 — Regional-language misinformation triage for WhatsApp forwards**
Screenshot/forward → claim extraction → verdict + source + why people believe it.
- Impact **10/10**, originality **9/10**, demo **9/10**.
- Feasibility **6/10** — ground truth data is hard to obtain in 12h; accuracy claims are dangerous to make. Weaknesses in evaluation will cost you the *technical implementation* score.

**#4 — "Where did my performance regress?" time-travel debugger**
Upload a repo + dataset history → bisect to the exact commit that broke performance, with an explanation.
- Demo **8/10**, technical depth **10/10** (bisection + profiling), originality **9/10**.
- Feasibility **6/10** — needs a real perf harness and history; demo needs setup, which violates rule "no friction".

**Verdict:** #1 wins. It is the only candidate where the *judge becomes the user in one click*, it needs no keys, no data, no upload, and it is unmistakably original. #2 is the pivot if the theme lands on social impact / India.

---

## 2. The recommended project

**Working name: `COUNTEREXAMPLE`** (alt: *BreakIt*, *Hidden*, *Falsify*)
Tagline: **"Paste your code. We will find the input that breaks it."**

### 2.1 The problem, stated so a judge feels it in 5 seconds
> Every developer and DSA student ships code that passes the tests they wrote. The bugs live in the inputs nobody imagined. In 2026 the majority of shipped code is AI-generated, and hidden-test failures are the single biggest cause of wrong answers — research shows a meaningful fraction of "passing" benchmark patches are functionally broken under full tests, and ~half of AI solutions that pass SWE-bench would be rejected by real maintainers.
> **Counterexample is an adversarial tester that lives in the browser.** Give it a function. It writes a second, independent implementation, generates thousands of inputs, and hands you the *smallest input that makes your function disagree* — then explains why, in plain English, and proposes the fix.

### 2.2 Why this wins on each published criterion

| Criterion | How the project answers it |
|---|---|
| Problem understanding | Names the *real* root cause: not "no tests" but "no one knows which input matters". Quantified. |
| Functionality | One action → a verified, reproducible failing input + fix. Depth, not breadth. |
| Technical implementation | AST-driven input inference, property-based fuzzing, **differential testing** against an independent oracle, **delta-debugging shrinker**, mutation-testing score, hardened server-side `node:vm` sandbox. Real, defensible engineering. |
| Originality | Test-oracle synthesis + counterexample minimization as a *product* — novel to this audience. |
| Usability | Paste → result in 15s. No signup, no upload, no key. Best-in-class zero friction. |
| Execution | Deployed static site, deterministic core, fallback when LLM is down. |
| Completeness | Judge gallery, shareable permalinks, exportable failing test, README, demo video, architecture doc. |
| Overall quality | Designed UI, honest failure modes, no dead buttons. |

### 2.3 Technical design (what you actually build)

**Architecture.** Vite + React + Tailwind frontend → Express API → analysis engine in **Node.js**, with user code executed inside a hardened sandbox (`node:vm` inside a `worker_thread`, with a hard wall-clock timeout, frozen intrinsics and no `require`/`process`/`global` access). The worker is spawned per request and killed on timeout, so a pathological submission cannot hang or corrupt the server. Static assets are served by the same process, so a single deployable unit covers everything.

> **Why Node and not Pyodide/WASM:** a cold Pyodide load costs 10–15s in the browser, and the free-tier inference budget is better spent on the oracle. Node gives sub-second analysis, full control over timeouts, and an `acorn`-based AST for input inference. The tradeoff is that the service *can* go down — mitigated by (a) a health endpoint, (b) the seeded gallery on the frontend which renders with zero API calls, and (c) a static-analyzer fallback for the explanation layer.

Pipeline (per submission):

1. **Parse** — `acorn`: locate the target function, infer parameter types and constraints from JSDoc annotations, defaults, and usage.
2. **Input schema inference** — build a generator: numeric bounds from comparisons and literals found in the code (`n-1`, `0`, `MAX`), list sizes, strings, and a bias toward "awkward" values: `0`, `1`, `-1`, empty array, single element, duplicates, sorted/reverse-sorted, all-equal, `MAX_SAFE_INTEGER`, unicode. This step alone is where most of the "smart" is, and it is deterministic and fast.
3. **Oracle synthesis** — ask a free-tier model (Google AI Studio / Groq / OpenRouter, **optional**) to write an *independent* brute-force/slow-but-obviously-correct implementation of the same spec. Fourteen hand-written reference oracles ship in the source for common problem classes (reverse, sum, max, second-largest, palindrome, rotate, count vowels, binary search, dedupe, flatten, fib, gcd, isPrime, sorted) so the demo works with **zero network** and zero key.
4. **Differential fuzzing** — run both implementations over 5k–50k generated inputs in the sandboxed worker with per-input timeouts. Catch: wrong answers, exceptions, non-termination, and **non-determinism** (same input, two runs, different output). Each category is a distinct, named finding.
5. **Shrink** — delta debugging (ddmin-style) to reduce the failing input to a minimal one, then render it as the tightest literal call: `f([], 0)`.
6. **Explain & fix** — LLM turn: given the original code, the oracle, and the minimal counterexample, explain the root cause in 2 sentences. Deterministic fallback: static heuristics keyed to the named bug class (e.g. missing empty-input guard → "add a base case"). No patch is generated.
7. **Mutation score** — flip a few operator mutants of the user's function and confirm the reported counterexample family actually kills them. This is the "did you really test it" proof, and it is the detail that signals research-level seriousness to a technical judge.

**Killer feature (the unforgettable moment):** a pre-seeded gallery of 8 buggy solutions across difficulty levels, one of which reproduces a **real historical bug from a well-known open-source project or a famous LeetCode editorial pitfall**. Caption: *"This is not a synthetic demo — this is a genuine edge case our tool found."* Validated claims beat claimed capabilities.

### 2.4 What to cut if you run late (cut from the bottom, in this order)
1. Mutation score.
2. LLM explanation → static heuristic explanation only.
3. Non-determinism check.
4. Permalinks / history.
5. **Never cut:** the differential fuzzer, the shrinker, the gallery, the deploy.

---

## 3. The 12-hour execution plan

Non-negotiable rule: **a deployed, working demo at 4:00 PM beats a better demo at 9:55 PM.** Deploy early, deploy often, keep the deployed URL alive all night.

| Time | Focus | Definition of done |
|---|---|---|
| 10:00–10:40 | Read theme announcement in WhatsApp. Decide idea (or confirm #1 / pivot to #2). Write a 5-line problem statement and *record a 30-second voice note of your pitch* — if the pitch isn't crisp, the idea isn't ready. | Problem statement committed in README draft. Repo + CI-less static host skeleton live. |
| 10:40–12:30 | **Core engine v0**: AST parse → schema inference → fuzz loop with a hardcoded oracle. No UI beyond a textarea + console. | Finds the *easy* seeded bug end-to-end. |
| 12:30–13:15 | Break. Eat. Step away. | — |
| 13:15–15:00 | Shrinker (ddmin), timeout handling, exception capture, multi-category findings. | Minimal counterexample `<= 3` lines for every seeded bug. |
| 15:00–16:00 | **CHECKPOINT 1 — deploy v0** to Vercel with plain styling. Send the link to one friend on another network. | Public URL works on mobile. |
| 16:00–18:00 | The real UI: side-by-side code panes, animated "executing 24,193 inputs", counterexample card, fix diff, gallery. | Looks designed, not scaffolded. |
| 18:00–19:00 | LLM layer: oracle synthesis, explanation. Graceful degradation if no key. | Works offline with the 14 shipped oracles. |
| 19:00–20:30 | Seed gallery (8 bugs, 1 real-world provenance), mutation score, permalinks, error states, empty states, mobile pass. | Zero dead buttons. |
| 20:30–21:30 | **CHECKPOINT 2 — freeze features.** README, architecture diagram, 2-min demo video (screen-record a real run), screenshots. | Submission text drafted. |
| 21:30–22:00 | Submit. Verify every link opens incognito. Buffer for the Unstop form. | Submitted before 9:40 PM. |

**Team of 2 split:** Person A owns engine (steps 10:40–19:00, all analysis code). Person B owns UI, deploy, seeding, docs, demo video from minute one. Never let one person own the deploy — it's the single point of failure. **Solo note:** collapse the plan to this order — engine core (10:40–15:00) → deploy (15:00) → UI (16:00–18:30) → LLM layer + seeding (18:30–20:30) → freeze, docs, video, submit (20:30–21:30). Protect the two deploy checkpoints above everything else.

**Overnight before the event (do it now, not on the day):** pre-create the repo, the host project, the free LLM keys, the demo video template, the seeded bug set, the README skeleton. On hackathon day you should only be writing engine code.

---

## 4. Submission packaging (judges see this, not your code)

Assemble **before 9:00 PM**, as a single artifact:

1. **Live URL** — loads in <3s, no key, mobile-friendly, has a seeded demo visible at the top of the page so a judge sees the "wow" without typing anything.
2. **One-line pitch** (max 120 chars): *"Paste any function; we return the smallest input that breaks it."*
3. **Problem paragraph** (3 sentences): the pain, the evidence, the fix.
4. **Architecture diagram** (one image) — shows real engineering depth at a glance.
5. **2-minute demo video** (screen recording, unmuted narration-free captions ok). Judges who won't click links still get the full story.
6. **GitHub repo** — clean history with meaningful commits across the 12h (proof of real work, not one "final" push), good README with setup in 3 commands, license, and an `ARCHITECTURE.md`.
7. **What we did not build** + **known limitations** section. Judges reward honesty; it signals engineering maturity and pre-empts their own objections.
8. **Evidence section** — the table: 8 seeded bugs, mutation score per bug, real-world provenance case, wall-clock time per analysis. Numbers beat adjectives.

---

## 5. Risk register

| Risk | Probability | Mitigation |
|---|---|---|
| Theme announced on the day is narrow and mismatched | Medium | Idea must be taggable as AI/dev-tools/education. If theme is India/social-impact → pivot to candidate #2 using the *same UI shell* (engine work is reusable as a demo inside it). Decide by 11:00 AM. |
| Analysis server crashes on a malicious/pathological submission | Medium | Per-request worker with wall-clock kill; freeze intrinsics; static seeded gallery keeps the frontend meaningful if the API dies. |
| Free LLM tier rate-limits at judging time | High | Deterministic core requires **no** LLM. Fourteen oracles ship in the source, plus heuristics. LLM only *enhances*. |
| Judge's machine / network is slow or offline | Medium | First paint shows the seeded gallery result with no execution needed. |
| You run out of time at 8 PM with a half-UI | High | Two deploy checkpoints. Cut list in §2.4 pre-agreed and pre-delegated. |
| Judges skim and don't read | High | The 15-second GIF/video in the submission + a landing page that animates the counterexample being found. |
| Random teammate stalls | Medium | Email `hello@algoxilla.com` for team formation **now**, with both registration screenshots. If solo, that's fine — this plan is solo-first by design. |

---

## 6. Non-negotiables

1. **Problem statement before code.** If you can't say the problem in one breath a stranger understands, the idea isn't ready.
2. **Demo before docs.** Deploy by 4 PM.
3. **Zero friction beats zero features.** 5 features that work > 20 that half-work.
4. **Original > impressive.** Do the thing 300 other people aren't doing.
5. **No API key in the critical path.** Never let your demo depend on a service you don't control.
6. **Numbers in the README.** Prove the claims.
7. **Submit by 9:40 PM**, not 10:00 PM.

---

## 8. What was actually built (status)

The recommendation in §2 was implemented end to end. Current state:

**Engine** — `server/engine/`, all verified:
- `sandbox.js` hardened `node:vm`, per-call timeout, explicit literal serialiser
- `analyze.js` `acorn` AST walk, parameter type inference, bounds from comparison operators
- `generator.js` boundary-biased input generation (not random fuzzing)
- `oracles.js` 14 built-in references + optional model synthesis, works with zero network
- `shrinker.js` ddmin chunk removal + plainest-value ladder
- `classify.js` bug-class naming (heuristic, 70% and measured as such)
- `benchmark.js` labelled suite with false-positive controls

**Verification** — both run in CI:
- `npm run selftest` → 13/13 seeded examples produce a minimal counterexample
- `npm run benchmark` → 95% detection, 0% false positives, 70% class naming

**Web** — `web/src/`, 62KB gzipped: hero with a real pre-computed result, editor,
counterexample card, bug-class panel, mutation panel, 13-card gallery, benchmark
matrix, pipeline explainer, honest limitations.

**Kit** — `README.md`, `ARCHITECTURE.md`, `DEMO_SCRIPT.md`, `render.yaml`,
`.github/workflows/ci.yml`.

### Deviations from the original plan, and why

1. **Node sandbox instead of Pyodide.** Chosen after the user's stack came back
   JS/TS + UI + backend. Removes a 10-15s cold load and gives full control over
   timeouts. Cost: JavaScript only, stated plainly in the README.
2. **A benchmark suite was added** beyond the original plan. It turned out to be
   the strongest differentiator available — a measured 0% false-positive rate is
   far harder for a competitor to dismiss than any feature list.
3. **Generated data files are committed.** Zero-network first paint and a CI
   staleness check. Found non-determinism (timing fields, key ordering) while
   building it; both fixed.
4. **Budgets tightened from 6s to 2.5s.** The engine converges well before the
   caps; the caps only bound the pathological tail.

### Known gaps, in priority order

- JavaScript only — the largest scope limitation, and honest about it.
- No permalinks or shareable result URLs. Was in the original cut list; a
  reasonable post-hackathon addition if there is time left.
- Class naming at 70%. The residual errors are cases where several bug classes
  are indistinguishable at runtime.
- `max-with-nan` is a known structural miss: differential testing cannot catch a
  bug both implementations share.

---

## 9. First actions (today, before the event)

- [ ] Register on Unstop; join the WhatsApp community (mandatory).
- [ ] Email team-formation request if partnering.
- [ ] Pre-create repo + deploy target + free LLM keys (Gemini AI Studio, Groq, OpenRouter fallbacks).
- [x] Seeded buggy solutions — 13 written, all verified to break.
- [x] README, ARCHITECTURE and DEMO_SCRIPT written.
- [ ] Set up a 30-second Loom recorder so demo capture is one click.
- [ ] Deploy to Render and confirm `/api/health` responds.
- [ ] Record the demo video following `DEMO_SCRIPT.md`.