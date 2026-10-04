# ALGOTHON'26 — Analysis & Execution Plan

Written 4 Oct 2026, ~07:15 IST. Build window opens **10:00 IST**, closes **22:00 IST**.
Results 5 Oct, 20:30 IST.

> **Updated 4 Oct 07:50 IST** — §0.1 blocker **closed**: the validator oracle is
> built and verified, and it finds a real coercion bypass with the false-positive
> rate intact. §10 re-sequenced.
> **Clock now: 07:50 IST. 2h10m to the 10:00 window opening, 14h10m to the 22:00 deadline.**
>
> *Note on timestamps:* §0.2 was headed "12:48 IST", which was a local-clock
> reading mislabelled as IST. This machine runs UTC+0 (local 13:17 = IST 07:47),
> a 5h30m offset. All times in this document are true IST.
>
> Prior note: §0.2 added (session fixes + corrected status), §1.4 git staleness
> corrected, §10 re-sequenced against the clock.

---

## 0. Verified status, empirically checked 07:30 IST

Rather than assume the existing build works, it was exercised directly.

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run selftest` | **19/19** — 13 counterexamples, 3 security bypasses, 3 correct validators with no false positive |
| `npm run benchmark` | 95% detection, **0% false positives**, 70% class accuracy — stable across 3 consecutive runs |
| `npm run check:data` | passes |
| `GET /api/health` | `{"ok":true,"llm":null}` — graceful degradation confirmed |
| `GET /api/examples` | 15 examples — 3 security validators first, then 12 general |
| `GET /` (production mode) | HTTP 200, SPA served from `dist` |
| `POST /api/analyze` | works on value-returning functions |

### 0.1 The gap that decided Phase 1 — now closed

Testing the actual CYBER-02 use case found this:

```
POST /api/analyze  { code: "function validateQty(q) { if (q <= 0) ... }" }
-> { "status": "oracle-missing" }
```

The engine returns `oracle-missing` for a validator. **This is the single most
important engineering task in the plan.**

The reason is structural, and worth stating precisely: every oracle we have assumes
the subject returns a *value* that a reference implementation can also produce. A
security validator returns `null` or an error *string* — `if (q <= 0) return "must be
positive"`. There is no reference implementation of "the correct error message for
input q", so nothing to differ against, so nothing to shrink.

~~Until this is built, the most valuable security demo does not run.~~ **Built and
verified 08:45 IST.** See below.

**The fix that shipped:** a validator oracle does not compare outputs, it compares
*acceptance*. The policy is stated explicitly as a reference function, and any input
where the validator's verdict disagrees with the policy is reported, with the two
directions named separately (`bypass` vs `false-rejection`) because only one of them
is something a reviewer has to act on.

Verified behaviour:

| Subject | Policy | Result |
|---|---|---|
| `validateQty` — `if (q <= 0)` / `if (q > 100)` | integers 1..100 | **bypass** — reported as `validateQty(true)` on some runs and `validateQty(NaN)` on others, `expected: reject, actual: accept` |
| `isValidAge` — `if (a < 0)` / `if (a > 120)` | age preset | **bypass** — `isValidAge(null)` |
| `checkPort` — `Number.isInteger` then range | port preset | **no counterexample** — 0% false positive preserved |

The mechanism is **type coercion**. `true`, `null`, `""`, `NaN` and `Infinity` all
compare false against both bounds, so a range check written with comparisons alone
lets every one of them through. There is not one bug here, there is a family of them,
and the shrinker reports whichever it reaches first — which is why the same validator
yields a different minimal input across runs. Every one of them is a genuine bypass;
none of them is the "right" answer to quote, so the demo should show the family
rather than a single input. This also means `validateQty` is a *deterministic* subject
whose *reported counterexample* varies, which is the opposite of the
`nondeterministic-sum` case where the subject itself is random.

The policy is written by hand rather than derived from the subject's own AST, and
that is deliberate: in `if (q <= 0) return "must be positive"` those comparisons are
*rejection* guards, so reading them as acceptance bounds inverts the rule and would
produce an oracle that falsely accuses correct validators. Guessing a security
policy from the code it is meant to police is the wrong direction of trust.

Regression-checked after the change: typecheck clean, selftest 19/19, benchmark
unchanged at 95% / 0% / 70%.

Note this is also the honest demonstration of ReDoS and inverted auth comparisons:
those are *disagreement* bugs, which the existing oracle machinery already handles.

### 0.2 Session update — 07:20 IST

> **Superseded in part.** The finding below — that `analyzeWithoutOracle` does not
> solve the validator case — was correct when written, and `analyzeWithoutOracle`
> indeed does not solve it. The validator oracle described in §0.1 has since been
> built directly and verified, so task 1.3 is now **done**, not pending. The four
> defect fixes below all stand.

**At the time of writing, the §0.1 blocker was still the blocker.**
`analyzeWithoutOracle` (below) was
added and does **not** solve it: a validator returns a string or `null`, so it
neither crashes nor hangs, and it will fall through to the honest dead end.
Task **1.3 was the single highest-value engineering item**.

Four defects found and fixed, all verified:

| # | Defect | Severity | Status |
|---|---|---|---|
| A | `JSON.stringify` silently maps `Infinity`/`-Infinity`/`NaN` → `null`. The API and **two shipped gallery cards** reported `"expected": null, "actual": null` — a counterexample that does not look like one. `sandbox.js` already documented this exact hazard for the generated call string; the guard was never applied at the JSON boundary. | **High** — the flagship demo card contradicted itself | **Fixed.** New `server/engine/json-safe.js`, applied at the single serialization point; decode in `web/src/lib/format.ts`; snapshot regenerated |
| B | Any function without a library oracle returned `oracle-missing` in **~24 ms without running at all**, while its own message promised it could "detect crashes and timeouts". The product broke its own promise in its own words. | **High** — fails the moment a judge types their own function | **Partly fixed.** `analyzeWithoutOracle()` now hunts and shrinks provable crash/hang defects. Verified: `JSON.parse` → `parseUserAge(null)` `TypeError`; `while(true)` → non-termination; *wrong-answer* fn → correctly refuses to guess |
| C | `app.set('trust proxy')` was never set, so behind Render's proxy `req.ip` is the proxy address and **every judge shares one 30-runs/minute bucket** → 429s while several judges click Run simultaneously. | **Medium** — bites *during* judging | **Fixed** in `server/index.js`. Verified: limiter still fires exactly at request 31 |
| D | Three checkable false claims in the hero: "in your browser" (it runs server-side in `node:vm`), "writes an independent implementation" (false without an API key), "live result" (it is a build-time snapshot). | **Medium** — a curious judge checks claims | **Fixed**, and the rewrite is *stronger*: the no-key determinism is the differentiator, so the copy now leads with it |

**Corrected repository status** — §1.4 is stale on this point:

```
$ git remote -v          # EMPTY — never pushed
$ git log --oneline -1
fc41abe Initial commit: differential testing engine, web UI and benchmark suite
```

The repo **exists** and is committed (§10 item 1 is genuinely done). What is
missing is the **remote**. `SUBMISSION.md` requires a public repository link, and
`render.yaml` deploys from a git remote — so this single missing thing blocks
*both* required submission fields. It remains the top blocker.

No deployed URL appears anywhere in the project. The only URL in the repo is the
placeholder CI badge at `README.md:5`, pointing at `github.com/your-org/counterexample`
— a 404.

Also fix before submitting: `README.md:5` badge placeholder, `README.md:8-9,77`
(same false "writes an implementation" claim), and quarantine
`ALGOTHON26_STRATEGY.md` from anything judge-facing — it is internal strategy and
contains false claims ("sandboxed in-browser execution (WASM)", "deployed static
site", "~20 pre-cached oracles", a unified-diff fixer never built, and a
"300 competitors" line).

---

## 0bis. Not in the official weighting, but real risks

### 0ter. ALG-CYBER-02 workflow built — 16:35 IST

The PS text requires working on a **web application** and lists six must-haves. Three
were unmet, and two of them are named in the judging focus (*"quality of fixes and
regression testing"*). Closed by `server/target/` (task 1.2 + 1.6 from §4):

| Must-have | Before | Now |
|---|---|---|
| Authentication / input inspection | input only | input **and** an access-control predicate (V3) |
| Vulnerability identification | ✅ | ✅ |
| Safe demonstration | ✅ | ✅ plus `npm run audit` / `GET /api/audit` |
| **Secure fixes** | ❌ | ✅ a real patch per finding, compiled and executed |
| **Retesting** | ❌ | ✅ same attack re-run after the fix |
| **Root-cause documentation** | partial | ✅ prose root cause per finding, expandable in the UI |

`npm run audit` (or `GET /api/audit`, ~7s) runs the whole loop:

```
V1  validateQty(NaN)              accepted 1ms -> rejected 1ms      6/6 legit   FIXED_AND_VERIFIED
V2  isStrongEnoughPassword(redos) hung 1509ms  -> returned 1ms      3/3 legit   FIXED_AND_VERIFIED
V3  authorize("user", 0)          accepted 0ms -> rejected 1ms      3/3 legit   FIXED_AND_VERIFIED
Regression: 12/12 legitimate cases pass, 0 broken by the fixes, functionality preserved: yes
```

Design points worth keeping if this is touched again:

- **The fix is verified behaviourally, not textually.** Each patched function is
  compiled and run in the same `node:vm` sandbox as the audit, so a patch that looks
  right but breaks the app fails.
- **A fix that *improves* legitimate behaviour is not counted as a regression.** Only a
  case that passed before and fails after counts — otherwise a correct patch gets
  penalised.
- **Detection is reported honestly.** V1 is found automatically by the policy oracle; V2
  and V3 are confirmed against a supplied attack, because a ReDoS trigger and an inverted
  comparison both need knowledge a fuzzer cannot synthesise from source. This is how real
  testing works, and claiming otherwise would be the exact kind of overclaim §0.2 removed.
- **Safe by construction.** The target is framework-free and compiled in a sandbox; an audit
  never sends a request to a real service.

Now in the product: `AuditPanel.tsx` renders it above the fold area, and the hero leads with
the V1 bypass. The original analyser still works alongside it (paste a validator → bypass).

- **Render free tier sleeps.** `render.yaml` sets `plan: free`, which spins down
  after ~15 min idle with a 30–90s cold start. `SUBMISSION.md`'s "loads in under
  3 seconds" is **false**. Mitigation is a free GitHub Actions cron on
  `*/10 * * * *` hitting `/api/health`. ~10 min. Do it after the remote exists.
- **Demo video.** `DEMO_SCRIPT.md` already exists and §3.1 schedules it. Say
  **Ctrl+Enter**, not ⌘↵ — the script says ⌘ but the machine is Windows.

---

## 1. Facts established from the official documents

Sourced from `ALGOTHON26_All_12_Problem_Statements_with_PSID.pdf` and the case file.
Anything not in these documents is labelled **[inference]**.

### 1.1 Evaluation weighting (this is the single most useful page in the pack)

| Criterion | Weight | What it rewards |
|---|---:|---|
| Functionality & Completion | **30%** | "Does the core solution actually work?" |
| Technical Implementation | **20%** | Quality, architecture, appropriate technology |
| Innovation & Problem Understanding | **20%** | Originality and depth of solution |
| User Experience / Presentation | **15%** | Clarity, usability, demo quality |
| Testing, Edge Cases & Reliability | **15%** | Robustness beyond the happy path |

Organiser principle, printed verbatim: **"AI may help you build it. But you still
have to make it work."** 55 of the 100 points (Functionality + Testing) are about
*the thing actually running correctly*, not about concept novelty.

### 1.2 Common submission expectations — applies to all 12 PS

- Working project **with a deployed demo** where practical
- Source-code repository with a clear README
- **Architecture diagram** and explanation of major technical decisions
- Demonstration of the core workflow required by the selected PS
- **Testing evidence** and handling of important edge cases
- **Known limitations** and future improvements
- **Disclosure** of external APIs, datasets and AI-assisted components used

Seven concrete checkboxes. A judge with 300+ submissions is scanning for these
specifically. Each one is cheap to satisfy and expensive to miss.

### 1.3 The 12 options

| PS ID | Title | Domain |
|---|---|---|
| ALG-AI-01 | AI Resume & Job Matching | AI/ML |
| ALG-AI-02 | Intelligent Document Investigator | AI/ML |
| ALG-WEB-01 | Collaborative Project Workspace | Web |
| ALG-WEB-02 | Offline-First Application | Web |
| ALG-BC-01 | Digital Certificate Verification | Blockchain |
| ALG-BC-02 | Blockchain Escrow System | Blockchain |
| ALG-AUTO-01 | Visual Workflow Automation | Automation |
| ALG-AUTO-02 | Smart Application Processing | Automation |
| ALG-DATA-01 | The Mystery Dataset | Data Science |
| ALG-DATA-02 | Predict What Happens Next | Data Science |
| ALG-CYBER-01 | Find the Intruder | Cybersecurity |
| ALG-CYBER-02 | Secure the Application | Cybersecurity |

There is **no announced theme**. We choose our own PS ID and build against it.

### 1.4 Situation audit — two hard blockers found

```
$ git status
fatal: not a git repository (or any of the parent directories): .git

$ date (IST)
Sun Oct  4 07:00:43 IST 2026
```

1. **~~This directory is not a git repository.~~** **RESOLVED 07:xx.** `git init`
   ran and the tree is committed (`fc41abe`, 52 files). See §0.2 — the repo is
   real; it has simply **never been pushed**, which is the remaining form of this
   blocker.
2. **~~The build window has not opened yet.~~** **RESOLVED.** It is 12:48 IST;
   the window opened at 10:00 and we are 2h48m in, on schedule.

Also unverified: whether anything is actually deployed. `render.yaml` exists, but
Render deploys from a git remote and there is no git remote.

---

## 2. The critical finding: the current project does not match any problem statement

COUNTEREXAMPLE as built is *"paste your code, get the smallest input that breaks it."*
Scored honestly against the 12 PS, it maps cleanly onto **none of them**. It is a
developer tool. The closest options are all distant:

- ALG-CYBER-02 — needs a web app, auth, OWASP vulns, fixes
- ALG-AI-02 — needs document ingestion, RAG, Q&A
- ALG-DATA-01 — needs dataset cleaning, analysis, visualisation

Submitting as-is against any of these would score well on *Technical Implementation*
(20%) and *Testing* (15%), and badly on *Functionality & Completion* (30%), because the
judges would not find the PS's required workflow anywhere in the product. That is a
losing position at 30% weight.

This is the single most important thing in this document.

---

## 3. Decision: ALG-CYBER-02 — Secure the Application

Every one of its five must-haves maps onto machinery we already have:

| ALG-CYBER-02 must-have | What we already have |
|---|---|
| Vulnerability identification | Differential engine finds inputs where a validator disagrees with the intended policy — a bypass, by definition |
| Safe demonstration | Hardened `node:vm` sandbox. We never fire at a real target. "Safe" is structurally true, not a promise |
| Secure fixes | Shrinker already produces the *minimal* trigger, which is what makes a fix verifiable |
| Retesting | Re-run after the fix; a surviving counterexample is a regression |
| Root-cause documentation | The minimal counterexample **is** the root-cause evidence |

Its stated judging focus is *"correct vulnerability identification, safe testing,
quality of fixes and regression testing."* Every clause maps.

### 3.1 Why this is authentic, not a stretch

Input validators and auth predicates are tested by the examples their author
imagined — which is precisely why they get bypassed. This is a real, well-known class
of bug, and differential fuzzing is the recognised technique for finding it. Three of
our existing bug classes are already genuine security vulnerabilities:

- **non-finite** — `NaN` passing a range check. `if (qty <= 100)` does not reject
  `NaN`, because every comparison with `NaN` is false. Classic real-world bypass.
- **non-termination** — catastrophic backtracking in a password regex. **ReDoS.**
  Our timeout detection already finds this, and the hanging input is a live DoS vector.
- **wrong-comparison** — an inverted comparison in an access-control predicate.

### 3.2 Why not the others

- **AI/ML, Data Science (4 PS)** — would need to be built from zero in 12h. Our engine
  is not reusable. Highest risk against the 30% functionality criterion.
- **Blockchain (2 PS)** — Solidity, wallet, testnet, MetaMask. Same problem: nothing
  we have transfers, plus dependency and flakiness risk.
- **ALG-CYBER-01 Find the Intruder** — log analysis and correlation. Our engine is
  for code, not log streams. Poor fit.
- **ALG-CYBER-02** — high reuse, every must-have covered, and the "safe demonstration"
  requirement plays to a real strength.

**[inference]** The physical-goodie prize structure (tumbler, mouse pad) suggests a
student/community-run event with volunteer judges. They will reward a clear demo and
honest evidence over enterprise architecture. The plan below is built for that.

---

## 4. Repositioning: from code tester to vulnerability finder

Same engine, different product. The change is in framing, domain examples, and one
new target app.

**Keep unchanged (this is ~85% of the codebase):** sandbox, generator, oracles,
shrinker, classifier, analysis orchestrator, benchmark, self-test, API, web UI.

**Change:**
- Domain vocabulary: validators and access-control predicates instead of generic functions
- Examples: security rules, not toy algorithms
- Add: a small deliberately-vulnerable Express target the engine actually audits
- Reframe the benchmark as a **security** benchmark: correct validators must not be
  flagged (false positives = crying wolf on a security tool = useless)

---

## 5. Where the 100 points come from

Effort allocated against actual weighting, not against what is most fun to build.

| Criterion | Wt | Our position | Work required |
|---|---:|---|---|
| Functionality & Completion | 30% | Engine works (95% detection, 0% FP). **But PS workflow not demonstrated** | **Target app + end-to-end audit flow. Highest priority.** |
| Technical Implementation | 20% | Strong: sandbox, AST analysis, ddmin shrinking, 14 oracles | Architecture diagram + decisions doc |
| Innovation & Problem Understanding | 20% | Differential + deterministic core, LLM optional | Sharpen the "why this is not another AI wrapper" story |
| UX / Presentation | 15% | Strong editor + hero, but no deployed URL | **Deploy. Biggest cheap win available.** |
| Testing & Reliability | 15% | **Best-in-class already**: 19/19 selftest, 21+9 benchmark, published FP rate | Map explicitly onto the PS checklist |

The uncomfortable truth in this table: our strongest asset (reliability evidence) is
worth 15%, while the thing we have not done (a demonstrable PS workflow) is worth 30%.
**Spend the next three hours closing the 30% gap, not improving the 15%.**

---

## 6. Schedule (IST)

### Phase 0 — Pre-window, 07:15 → 10:00 (unlock the submission)
These are theme-independent and block everything else.

| # | Task | Why it is first |
|---|---|---|
| 0.1 | `git init`, write `.gitignore` properly, initial commit | No repo = no submission artifact. Nothing else matters |
| 0.2 | Create GitHub repo, push | Submission requires a repository link |
| 0.3 | Deploy (Render) from the remote, verify cold HTTPS load | "Deployed demo" checkbox; 15% UX + supports 30% functionality |
| 0.4 | Verify the live URL from a clean session, no API keys, on mobile width | An async judge on a phone is the real reviewer |
| 0.5 | Confirm `npm run selftest` = 19/19 and `typecheck` clean on a fresh clone | Proves the repo actually runs for a stranger |

### Phase 1 — Build, 10:00 → 17:00
| # | Task | Done when |
|---|---|---|
| 1.1 | Lock PS: ALG-CYBER-02, stated in README | Explicit |
| 1.2 | Build vulnerable target app: weak validator, ReDoS password regex, NaN-bypass quantity check | Engine finds all three |
| 1.3 | ~~Validator (acceptance-disagreement) oracle~~ **done** — see §0.1 | `validateQty(true)` reported as a bypass |
| 1.4 | Wire the policy selector into the web UI so the demo is one click | Judge reaches the bypass without typing policy JSON |
| 1.5 | Extend benchmark: security cases + correct-validator controls | FP stays 0% |
| 1.6 | End-to-end audit UI: paste validator → get bypass + minimal input + suggested fix | One screen, no setup |

Task 1.3 is done; 1.4 and 1.6 now have something to demo.

### Phase 2 — Evidence, 17:00 → 20:00
| # | Task |
|---|---|
| 2.1 | Architecture diagram + major technical decisions |
| 2.2 | Root-cause writeups for the 3 real vulns |
| 2.3 | Known limitations, future improvements |
| 2.4 | Disclosure: external APIs, datasets, AI-assisted components (state Gemini/Groq/OpenRouter are optional and off by default) |
| 2.5 | README rewritten for a judge with 60 seconds |

### Phase 3 — Submit, 20:00 → 22:00
| # | Task |
|---|---|
| 3.1 | Record a 90-second demo video as backup for a failed live link |
| 3.2 | Full rehearsal on a cold, logged-out browser |
| 3.3 | **Submit by 21:00**, not 21:55. A submitted entry is recoverable; a missed deadline is not |

---

## 7. Risk register

| Risk | Sev | Trigger | Mitigation |
|---|---|---|---|
| No repo / no live link at deadline | **Fatal** | 0.1 slips | Phase 0 first, 2h45m of slack |
| Judge's link fails | High | Cold-cache/auth wall | Phase 0.4; zero-setup design already; video backup |
| PS mismatch resurfaces | High | Judges expect OWASP app scanning | State ALG-CYBER-02 explicitly in README title line |
| ReDoS demo hangs the judge's browser | Med | Sandbox escape absent | Enforce hard timeouts in sandbox; never execute in page |
| Scope creep into blockchain/AI | High | Novelty itch | Cut list below is binding |
| Solo overrun | Med | Scope | Submit by 21:00 regardless of state |

---

## 8. Cut list — do not build these

Binding. Each is a real want that does not earn points against the weighting.

- Smart-contract escrow or certificate chain
- RAG / vector database / document ingestion
- Model training or dataset analysis
- User accounts, auth, payments
- Mobile app
- Anything requiring an API key to demo

---

## 9. Open decisions needed

1. **PS confirmation** — resolved: ALG-CYBER-02.
2. **Solo vs. team of 2** — you registered solo; the rules allow staying solo. A second
   person would roughly double Phase 1 throughput. Team formation needs an email to
   hello@algoxilla.com with both registration screenshots **before** pairing.
3. **LLM keys** — the engine is fully deterministic without them. Recommended: keep
   them off for the demo so the live link cannot fail on an expired key, and disclose
   them as an optional enhancement.

---

## 10. Immediate next actions

Re-sequenced at **07:50 IST**. 2h10m remain before the window opens.

1. ~~`git init` + first commit~~ **done** — 52 files, 12,188 lines, committed locally (`fc41abe`).
2. **Create the public GitHub repo and push.** *Needs your account — cannot be done from here.*
   ```powershell
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin master
   ```
   This unblocks **both** remaining hard blockers: the submission's repository
   link *and* the Render deploy.
3. **Deploy, then verify cold and logged-out with no API keys set.** Check the two
   previously-corrupted gallery cards (`max-empty-array`, `second-largest-duplicates`)
   no longer read `null` / `null` — if they do, the deploy is stale.
4. ~~**Task 1.3 — the validator oracle.**~~ **DONE (07:50 IST).** Built and verified:
   it reports a type-coercion `bypass` (`expected: reject, actual: accept`, class
   `validation-bypass`) for `validateQty`, `isValidAge` and `isNull` shapes, and a
   correctly-written validator still produces no false positive. See §0.1 for why the
   reported input varies between runs. Typecheck clean, selftest 19/19, benchmark
   unchanged at 95% / 0% / 70%.
4a. ~~**Task 1.4 — policy selector in the UI.**~~ **ALREADY WIRED** (policies.ts →
   Editor → App → api → server), verified with the exact payload the browser sends.
   No work needed.

Items 2 and 3 are the only things that can still produce a zero. Item 5 is the only
remaining thing that meaningfully raises the score.