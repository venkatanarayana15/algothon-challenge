# ALGOTHON'26 — Analysis & Execution Plan

Written 4 Oct 2026, ~07:15 IST. Build window opens **10:00 IST**, closes **22:00 IST**.
Results 5 Oct, 20:30 IST.

---

## 0. Verified status, empirically checked 07:30 IST

Rather than assume the existing build works, it was exercised directly.

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run selftest` | **13/13** produce a counterexample |
| `npm run benchmark` | 95% detection, **0% false positives**, 70% class accuracy — stable across 3 consecutive runs |
| `npm run check:data` | passes |
| `GET /api/health` | `{"ok":true,"llm":null}` — graceful degradation confirmed |
| `GET /api/examples` | 12 examples |
| `GET /` (production mode) | HTTP 200, SPA served from `dist` |
| `POST /api/analyze` | works on value-returning functions |

### 0.1 The one gap that decides Phase 1

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

Until this is built, the most valuable security demo (the NaN bypass) does not run.
Everything else in the plan assumes it works.

**The fix has a clean shape:** a validator oracle does not compare outputs, it
compares *acceptance*. Rewrite the subject's rule as an explicit reference policy
(`accept(q) = q > 0 && q <= 100`), then flag any input where `validateQty(q) === null`
disagrees with `accept(q)`. That is a bypass by definition, and it reuses the
existing generator, shrinker and reporter unchanged. This is roughly a day of the
available window, not a rewrite.

Note this is also the honest demonstration of ReDoS and inverted auth comparisons:
those are *disagreement* bugs, which the existing oracle machinery already handles.

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

1. **This directory is not a git repository.** The submission explicitly requires a
   *source-code repository link*. Right now there is no submission artifact at all.
   This is the number-one blocker and it is not close.
2. **The build window has not opened yet.** It is 07:00 IST; the window opens at
   10:00. We are not behind — we have ~2h45m of preparation time. Good.

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
| Testing & Reliability | 15% | **Best-in-class already**: 13/13 selftest, 21+9 benchmark, published FP rate | Map explicitly onto the PS checklist |

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
| 0.5 | Confirm `npm run selftest` = 13/13 and `typecheck` clean on a fresh clone | Proves the repo actually runs for a stranger |

### Phase 1 — Build, 10:00 → 17:00
| # | Task | Done when |
|---|---|---|
| 1.1 | Lock PS: ALG-CYBER-02, stated in README | Explicit |
| 1.2 | Build vulnerable target app: weak validator, ReDoS password regex, NaN-bypass quantity check | Engine finds all three |
| 1.3 | **Validator (acceptance-disagreement) oracle** — the blocking task from §0.1 | `validateQty` finds its NaN bypass instead of `oracle-missing` |
| 1.4 | Add 3–4 security rules as domain oracles | Passing selftest |
| 1.5 | Extend benchmark: security cases + correct-validator controls | FP stays 0% |
| 1.6 | End-to-end audit UI: paste validator → get bypass + minimal input + suggested fix | One screen, no setup |

Task 1.3 is first for a reason: without it, 1.2 and 1.6 have nothing to demo.

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

1. ~~`git init` + first commit~~ **done** — 52 files, 12,188 lines, committed locally.
2. **Create the GitHub repo and push** (needs your account — cannot be done from here).
3. Deploy and verify the public URL cold.
4. Build the validator oracle from §0.1 and prove it finds the NaN bypass.

Item 2 is the last remaining hard blocker: there is no repository *link* until the
remote exists, and the submission requires one.