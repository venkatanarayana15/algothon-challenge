# Demo video script — 2 minutes

Record once, cleanly. The video is what a judge sees if they never click the
link, so it has to carry the entire argument on its own.

**Setup before you hit record**

- Close every tab except the app. Hide notifications.
- Use a private window so extensions do not paint over the UI.
- Set the browser zoom to 100% and make the window full screen.
- Have `npm start` already running.
- Load the app, scroll to the gallery once so the fonts and images are cached.

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
> This is Counterexample. You paste a function, and it finds the smallest input
> that breaks it."

**Why:** state the problem and the promise in under fifteen seconds. No preamble,
no "hi, my name is".

---

## Beat 2 — Watch it work on my own code (0:15 – 0:50)

**On screen:** scroll to the editor. The `isPrime` function is already there.

1. Click inside the editor. Let the caret blink for a second.
2. Press **⌘↵**.
3. Watch the running state. Do not talk over the whole thing — one line:
   > "It reads the source, infers the parameter is a number, and generates inputs
   > biased toward the boundaries rather than random ones."
4. The counterexample card lands.

5. **Hover the "reduced from" line** if it is present.

> "It found `isPrime(-1)`. My function returns `true`; it should return `false`.
>
> Not a crash — a confidently wrong answer, on the one input I never thought to
> test. That's the bug that survives code review, because every line is
> individually defensible."

**Why:** the counterexample is the whole product. Slow down here.

---

## Beat 3 — It proves the test is real (0:50 – 1:15)

**On screen:** scroll to the mutation panel.

> "But finding an input isn't enough. What if that input doesn't actually test
> anything?
>
> So we inject six classic operator faults into the code — flip a loop bound,
> flip a comparison — and check whether this counterexample still catches them.
>
> Two of two killed. That means the test is genuinely exercising the logic, not
> just tripping over a side effect."

**Why:** this is the beat that separates a real tool from a party trick. Most
hackathon demos never get here. Judges remember it.

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

> "Thirteen seeded bugs, forty-five thousand generated inputs. Every card is a
> real run of the engine, not a mockup.
>
> Click any one and it loads into the editor, and you get the same
> counterexample yourself."

**Click one card's "run it"** and show the editor refilling.

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

> "Counterexample. Paste your code, get the input that breaks it. No signup, no
> upload, no API key — the link's in the submission, and the gallery's all
> reproducible from the repo."

**End on the hero. Hold for two seconds.**

---

## Recording checklist

- [ ] Cursor visible throughout
- [ ] No notifications, no personal tabs, no bookmarks bar
- [ ] ⌘↵ actually runs (test before recording)
- [ ] The counterexample card is fully rendered before you talk over it
- [ ] The benchmark section has scrolled into view fully before you start
- [ ] Under 2:05 — trim any hesitation, keep every pause
- [ ] No music, or something very quiet underneath
- [ ] **Watch it once end to end before submitting.** If any beat is confusing
      without sound, fix the captions — not the pace.