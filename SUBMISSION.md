# Submission checklist — ALGOTHON'26

Do this in order. The deadline is **9:40 PM IST, not 10:00 PM** — Unstop's form
and the verification steps need twenty minutes of slack, and the failure mode of
running late is total.

---

## T-minus 20 minutes: verify everything

```bash
npm run selftest      # must print 13/13
npm run benchmark     # must print detection / false-positive lines
npm run build         # must succeed
```

Then, from the **deployed URL** (not localhost), in an incognito window:

- [ ] Page loads in under 3 seconds on the first visit
- [ ] Hero shows a counterexample without scrolling
- [ ] Click "Find the counterexample" → counterexample card appears
- [ ] Mutation panel renders
- [ ] Gallery renders all 13 cards, filters work
- [ ] Benchmark section renders with the three headline numbers
- [ ] Works on a phone (narrow the window — do not skip this)
- [ ] **Open the deployed URL with all LLM keys unset.** It must still work.

That last one is the important one. Judging happens on someone else's machine,
possibly with a rate-limited or absent key. If the demo depends on the model, it
can fail at the worst moment.

## T-minus 15 minutes: write the submission text

Paste-ready, in the order below. Keep the pitch under 120 characters.

**One-line pitch**
> Paste any function; we return the smallest input that breaks it.

**Problem (3 sentences)**
> Every developer writes tests for the inputs they imagined, and the bugs live
> in the inputs nobody did. In 2026 most shipped code is AI-generated, and the
> dominant failure mode is no longer a crash — it is a confident, plausible,
> wrong answer on the one input that mattered. Code review does not catch these,
> because every individual line in an off-by-one is defensible.

**Solution**
> Counterexample is an adversarial tester. It reads your function's AST to infer
> what each parameter really is, generates thousands of inputs biased toward the
> boundaries rather than random, and compares your function against a second,
> independent implementation. Where they disagree, it shrinks the failing input
> with delta debugging until it is the smallest input that still reproduces — and
> verifies the result by injecting six operator faults to confirm the test
> actually catches them.

**Measured results**
> 95% of seeded bugs detected (20/21), 0% false positives against nine
> deliberately correct implementations, ~2s per analysis. Per-class detection
> ranges 67–100% across twelve bug classes. One known miss is documented.

**Submission fields**

| Field | Value |
|---|---|
| Live URL | your Render URL |
| Repository | GitHub link, public |
| Demo video | 2-minute recording, unmuted or captioned |
| Tech stack | React · TypeScript · Node · Express · acorn · Tailwind |
| One-line pitch | as above |

## T-minus 10 minutes: final link check

Open every link **in incognito**, one by one. Not in a normal window — you want
to know it works when you are not logged in.

- [ ] Live URL — loads, demo works
- [ ] GitHub repo — public, README renders, `npm install` steps are correct
- [ ] Demo video — plays in the Unstop preview
- [ ] Architecture diagram — if you attach one, it actually loads

## T-minus 5 minutes: submit

- [ ] Submit by **9:40 PM**
- [ ] Screenshot the confirmation
- [ ] Verify the submission appears in your Unstop dashboard

---

## If you are running out of time

Cut in this order. Never cut the live URL — a dead link scores zero.

| Cut | Saves | Cost |
|---|---|---|
| Demo video | 10 min | A judge who won't click loses the full story |
| Architecture diagram | 5 min | Minor |
| Benchmark section on the site | 0 | Already built; leave it |
| Extra gallery cards | 0 | Already built |

**Do not** cut the live URL, the counterexample flow, or the seeded gallery.
Those three are the project.

---

## After submission

- **Results: 5 October, 8:30 PM IST**, announced in the Algoxilla WhatsApp
  community. Join it now — it is mandatory and it is where submission issues
  get communicated.
- **Winner session** follows the announcement, for recognition and prize
  handover. Nothing to prepare.
- Keep the repo live through the judging window (4–5 October). If something
  breaks, a judge should not hit an error page.

---

## One-line fallback plan

If everything collapses at 9:45 PM, submit with: the Render URL, the GitHub
link, the two-minute video, and the pitch line. That is still a complete
submission — the rest is polish.