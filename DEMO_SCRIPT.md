# Demo video script — 2 minutes

**Problem Statement: ALG-CYBER-02 — Secure the Application.**

The script is built around the PS workflow judges are scoring — *identify a
weakness, demonstrate it safely, fix it, retest to prove the fix holds* — rather
than around the tool. Beats 2 and 3 are that workflow end to end.

Record once, cleanly. The video is what a judge sees if they never click the
link, so it has to carry the entire argument on its own.

**Setup before you hit record**

- Close every tab except the app. Hide notifications.
- Use a private window so extensions do not paint over the UI.
- Set the browser zoom to 100% and make the window full screen.
- Have `npm start` already running.
- Load the app, scroll to the gallery once so the fonts and images are cached.
- Know the two shortcuts you will use on camera: **⌘K** (jump to anything) and
  **⇧D** (run the demo, which does Beat 2 for you). Neither is decoration — the
  first saves you scrolling on video, the second removes the dropdown from the
  one beat that must not fumble.
- **Have the fixed validator ready in the clipboard**, for Beat 3:

  ```js
  function validateQty(q) {
    if (!Number.isInteger(q)) return "not a whole number";
    if (q <= 0) return "must be positive";
    if (q > 100) return "too large";
    return null;
  }
  ```

**Recording settings**

- 1920×1080, 60fps if available.
- Record the **cursor**. Three of the four beats depend on the judge watching
  where you click.
- Narrate as you go, or record silent and add captions afterwards. Captions win
  — many judges watch on mute.

---

## Beat 1 — The claim (0:00 – 0:15)

**On screen:** the hero, static, cursor resting beside the headline.

> "Every developer writes tests for the inputs they imagined. The bugs live in
> the inputs nobody did.
>
> This is Counterexample, built for ALG-CYBER-02. You paste a function, and it
> finds the smallest input that breaks it."

**Why:** state the problem and the promise in under fifteen seconds. No preamble,
no "hi, my name is".

---

## Beat 2 — It finds the bypass (0:15 – 0:50)

**On screen:** scroll to the editor. The `validateQty` function is already there,
and the policy is set to **Quantity**.

> **Fastest path:** press **⇧D** anywhere, or click **Run the 20-second demo** on
> the hero. That loads the vulnerable validator and attacks it in one step. If you
> would rather show the rule being chosen by hand — it is a real feature and it
> makes the next beat land harder — follow the numbered steps instead. Rehearse
> whichever you pick; do not switch mid-take.

```js
function validateQty(q) {
  if (q <= 0) return "must be positive";
  if (q > 100) return "too large";
  return null;
}
```

1. Click **Options**, point at the "Hold it to a rule" dropdown, set *Quantity*.
2. Close options. Press **⌘↵**.
3. The counterexample card lands, badged **bypass**.

> "It found `validateQty(NaN)`. The policy says reject — `NaN` is not a quantity.
> My validator returned no error, which means it accepted it.
>
> Here's why: `NaN <= 0` is false and `NaN > 100` is false, so a range check
> written with comparisons alone waves it straight through. `true`, `null` and an
> empty string do exactly the same thing. It's not one bug, it's a family, and the
> input it shows me can differ each run — every one of them is real.
>
> And notice it never fired at anything. I told it the rule, it ran thousands of
> inputs, and it found the one that gets through."

**Why:** this is the money shot. It is a named vulnerability class with a
one-character cause, and the tool named the kind of bug, not just the input.

---

## Beat 3 — Fix it, then prove the fix holds (0:50 – 1:15)

**On screen:** select all in the editor and paste the fixed validator. Press **⌘↵**.

> **One-click alternative:** the tool now composes that guard itself. After the
> bypass lands, click **Apply the guard and retest** — it inserts the line and
> re-runs in one step, and the **This session** trail underneath shows the bypass
> run followed by the clean retest with a "fixed and verified" banner. That is
> the whole workflow on screen without typing, and it saves about fifteen
> seconds of the two minutes. Either path is fine; do not use both.

The result is **no counterexample found**.

> "So now the fix: check the type before the range. `Number.isInteger(q)` first.
>
> Run it again. No counterexample. That's the part people skip — a fix that looks
> right isn't a fix until you've tried to break it again.
>
> And the reason I trust that 'no counterexample' here is that it isn't the
> default answer. This same tool reports zero false positives against nine
> deliberately correct implementations — it stays quiet when it should."

**Then click "Copy regression test"** (in the "Take the finding with you" row
under the result) and paste it into a terminal or a test file on screen.

> "And this is the part that turns a demo into a guard: the same report gives me
> the assertion to paste into the suite. `assert.ok(validateQty(NaN))` — it fails
> today against the vulnerable version and passes against the fix. That is the
> regression test, written by the tool, with the root cause attached."

**Optional, if time allows — hover the mutation panel:**

> "It also injects six classic operator faults into the code and checks whether
> this counterexample still catches them. Two of two killed, so the test is
> genuinely exercising the logic rather than tripping a side effect."

**Why:** identify → fix → retest is the exact PS workflow, and retesting is a
scored must-have. Almost nobody demonstrates it. The false-positive beat is what
makes "no counterexample" mean something.

**Verified before recording.** Both halves of this beat were run against the live
engine: the vulnerable validator reports `validateQty(NaN)` as a `bypass` classed
`validation-bypass`, and the fixed validator above returns `no-counterexample-found`
on three consecutive runs. If your recording disagrees with that, something is wrong
with the deployment, not with the script.

---

## Beat 4 — The benchmark (1:15 – 1:40)

**On screen:** scroll to "What this actually catches". Cards are pre-rendered.

> "Twenty-one seeded bugs, and — this is the part that matters — nine
> deliberately *correct* implementations as controls.
>
> Ninety-five percent of real bugs found. Zero percent false positives. Because a
> fuzzer that flags everything detects everything, and without a control you
> cannot tell those apart.
>
> And it's seventy percent on naming the bug class, which is a heuristic and
> labelled as one. One bug in the suite escapes it entirely and we left it in the
> table."

**Why:** this is the beat that turns "a nice tool" into "a measured tool."
Naming your own weaknesses *before* a judge finds them is the single most
persuasive move available here.

---

## Beat 5 — The gallery (1:40 – 1:52)

**On screen:** scroll to the gallery. Cards are already rendered.

> "Sixteen bugs, every card a real run of the engine rather than a mockup. The
> first three are the security cases — a bypass before an off-by-one.
>
> Click any one and it loads into the editor, and you get the same
> counterexample yourself."

**Click one card's "run it"** and show the editor refilling. Optionally reach it
with **⌘K** and type `gall` before pressing Enter — three seconds of keyboard
navigation that also shows the palette off.

**Why:** reproducibility is the strongest credibility signal you can offer.

---

## Beat 6 — Honesty (1:52 – 1:58)

**On screen:** scroll to "Where this breaks".

> "Here's what it doesn't do. No multi-file projects, no other languages, and
> the sandbox is not a security boundary — it's `node:vm`, which stops runaway
> loops and accidents, not a determined attacker.
>
> And when it finds nothing, it tells you that finding no counterexample is weak
> evidence, not proof of correctness."

**Why:** a judge who was about to write off "just another AI wrapper" stops
scrolling. Precision reads as competence.

---

## Beat 7 — The ask (1:58 – 2:05)

**On screen:** scroll back to the top. Hero in frame.

> "Counterexample, for ALG-CYBER-02. Paste your validator, get the input that
> gets through it — then fix it and prove the fix holds. No signup, no upload, no
> API key — the link's in the submission, and every result is reproducible from
> the repo. Every run also has a permalink, so a finding travels as a link that
> reopens this exact case."

**End on the hero. Hold for two seconds.**

---

## Recording checklist

- [ ] Cursor visible throughout
- [ ] No notifications, no personal tabs, no bookmarks bar
- [ ] ⌘↵ actually runs, and ⇧D runs the demo (test both before recording)
- [ ] ⌘K opens the palette and Enter selects (test before recording)
- [ ] Fixed validator is in the clipboard before you hit record
- [ ] The counterexample card is fully rendered before you talk over it
- [ ] The benchmark section has scrolled into view fully before you start
- [ ] Under 2:05 — trim any hesitation, keep every pause
- [ ] No music, or something very quiet underneath
- [ ] **Watch it once end to end before submitting.** If any beat is confusing
      without sound, fix the captions — not the pace.