# Architecture

Notes on why the engine is built the way it is. The interesting decisions were
all forced by a failure during development, so those are recorded here.

## Pipeline

```
source ─▶ analyze.js ─▶ generator.js ─▶ sandbox.js ─▶ shrinker.js ─▶ classify.js ─▶ llm.js
          (acorn)       (bias)          (node:vm)     (ddmin)         (heuristic)   (optional)
```

`analysis.js` orchestrates. Each stage is pure and independently testable; the
self-test exercises the whole chain against thirteen seeded submissions.

## Design decisions

### Differential testing, not property-based testing

The test-oracle problem is the reason most property-based testing does not find
logic bugs: you need to know the expected output, and writing that by hand is as
much work as writing the test. Comparing two independent implementations removes
the oracle requirement — if they disagree, one of them is wrong, and the
disagreement itself is the oracle.

The consequence shapes the whole design: the oracle must be *obviously* correct
rather than clever, so all fourteen built-in references are written for
naivety. A shared implementation bug would be worse than no oracle at all,
because it produces confident false findings.

### Biased generation, not random fuzzing

Random fuzzing finds crashes. It does not find logic bugs: the probability of
stumbling onto the one interesting input out of 10^6 is effectively zero within
a time budget. So `generator.js` enumerates boundary values — `0`, `1`, `-1`,
empty, single-element, all-equal, sorted, reverse-sorted, duplicates,
`MAX_SAFE_INTEGER`, `NaN`, `Infinity`, unicode — combined with bounds recovered
from the comparison operators in the user's own source.

### Ambiguity is preserved, not guessed

`reverseString(s)` builds its output with `out = s[i] + out` and never calls a
string method on `s`. Inferring "array" there tests the wrong input domain
entirely and finds nothing. So when `.length` reads and index accesses conflict
with the string evidence, the parameter stays `sequence` and the generator tries
both shapes. Guessing wrong is worse than admitting uncertainty.

### The shrinker is the product

`f([7,3,9,1,4,2,8,6,5], 4)` is a bug report nobody can act on. `f([1, 0])` is a
bug that gets fixed in four minutes.

Three passes, all deterministic:

1. **ddmin** — Zeller's delta debugging removes chunks of array elements.
   O(n log n), not the 2^n of "try every subset".
2. **Value ladder** — walks from exotic to plain (`Infinity` → large → small
   integer), keeping the *plainest* value that still reproduces. Taking the
   first candidate that works would settle for any halving that happens to
   succeed; taking the last gives `gcd(-1, 0)` instead of `gcd(-1, 33554431)`.
3. **Type normalisation** — replaces values whose type disagrees with the
   inferred schema, so `binarySearch([-Infinity], null)` becomes
   `binarySearch([1], 1)`.

Arity is always preserved. Dropping an unused argument produces a smaller input
and a confusing call, so unused arguments become neutral placeholders instead.

### The model is an enhancement, never a dependency

Every LLM call has a short timeout and returns `null` on failure. When the model
is unreachable the tool falls back to a pre-written oracle library and
pattern-matched explanations. It degrades to crash-and-timeout detection rather
than showing an error page.

This is deliberate: the demo must work at judging time, and a free-tier
rate-limit at the wrong moment should not cost a point.

### The gallery is generated, not written

`web/src/data/snapshot.json` is produced by running the real engine over all
thirteen seeded examples. The landing page renders from it, so the first paint
costs zero network requests and cannot fail to load. If the engine regresses,
the site starts telling a different — and true — story.

### The benchmark includes controls, and reports its own failures

`server/benchmarks.js` is 21 seeded defects plus 9 correct implementations. The
correct ones are the interesting half: without them a 100% detection rate would
be indistinguishable from a tool that flags everything, and a regression toward
over-reporting would be invisible.

Three findings from building it, all of which changed the code:

**Two "controls" were not correct.** `isPrime(Infinity)` does not terminate —
`d * d <= Infinity` is always true — and `fib(true)` returns `memo[true]`, which
happens to be right for `true` but is undefined for most non-numeric inputs.
Both were relabelled as bugs. A ground-truth label that disagrees with reality
is worse than no label, because it corrupts every rate derived from it.

**The benchmark caught a real miss.** `max-with-nan` uses `>=` in a maximum
scan; `NaN >= x` is always false, so a `NaN` element silently discards the true
maximum. The tool does not find it, because the oracle — a plain linear scan —
makes the same mistake. This is a structural blind spot worth naming: when both
implementations share a misconception, differential testing cannot help. It stays
in the reported table.

**Class naming is 70%, not 100%.** The classifier reads the shape of the
counterexample and the source, and it is wrong on cases where several classes
present identically at runtime — a short loop bound that merely *exposes* an
empty-array bug, for instance. That number is published on the site rather than
rounded away, and the UI labels every classification as a heuristic.

## Bugs found while building this

Four real ones, all caught by the self-test rather than by inspection.

**1. `JSON.stringify` silently mangles non-finite numbers.**
`NaN`, `Infinity` and `-Infinity` all serialise to `null`. The first version
built the sandbox call with `JSON.stringify(args)`, so the tool reported
`binarySearch([-Infinity], null)` as a counterexample — but the finding was the
mangle, not a bug in the user's code. Fixed with an explicit `toLiteral()`
serialiser that distinguishes all of them.

**2. The structural shrinker was exponential.**
The first implementation generated candidate subsets with `candidatesOf()`,
which is O(2^n) on arrays. A 32-element input has four billion subsets, so the
shrinker spent its entire budget enumerating and returned the input essentially
unshrunk. Replaced with proper ddmin chunk removal.

**3. The greedy ladder stopped at the first success.**
`simplifyLadder` returned the first candidate that still reproduced. Since the
ladder starts with a halving, any halving that happened to work was accepted —
yielding counterexamples like `gcd(-1, 33554431)` that are valid but read as
noise. Now the whole ladder is tested and the plainest survivor wins.

**4. Argument dropping changed arity.**
Minimisation could remove an unused parameter entirely, so a two-argument
function reported a one-argument call. Technically smaller, practically
confusing, and inconsistent with the displayed signature.

## Security posture

Honest about what this is. `node:vm` is **not** a security boundary — it has
known escape paths. What we do:

- A fresh context per request, so state cannot leak between submissions.
- `codeGeneration: { strings: false, wasm: false }` to block `eval` and
  `Function` construction.
- Frozen intrinsics (`Object`, `Array`, `String`, …) so the sandbox cannot be
  escaped into via prototype mutation.
- No `require`, `process`, `global`, `Buffer`, `fetch` or timers on the global.
- A hard wall-clock timeout per call, enforced by the VM itself.

This stops a tired competitor's `while (true)` at 9:55 PM. It does not stop a
determined attacker. Containing that needs process isolation with seccomp,
which is out of scope for a submission box and would be the honest thing to say
in the README — which it is.

## Deployment

One Node process serves both the API and the built static bundle, so there is a
single deployable unit and no frontend/backend split to configure. `render.yaml`
encodes this; `/api/health` doubles as the platform health check.

The constraint worth stating plainly: **the engine runs untrusted JavaScript
server-side, so static hosting is not an option.** Netlify Pages, S3 and the
Vercel static tier have no runtime. Render, Fly, Railway or a VPS do.

## Generated data is deterministic

`web/src/data/snapshot.json` and `web/src/data/benchmark.json` are committed, so
the site loads with zero network calls and can never show a stale-or-fake
finding. CI regenerates both and fails if the diff is non-empty.

Making that check possible required two fixes found by hashing consecutive runs:
wall-clock timings and input counts vary by tens of milliseconds per run, and
`byClass` / `rows` came out in nondeterministic key order. Both are now excluded
or explicitly sorted. The files are byte-for-byte identical across runs, which
is the only property that makes a staleness check worth having.

## Trade-offs

| Choice | Gained | Lost |
|---|---|---|
| JavaScript only | One engine, one sandbox, one language to get right | Most real codebases are not JavaScript |
| ddmin over full enumeration | Linear-ish shrinking | Can miss some smaller counterexamples |
| Heuristic explanations as fallback | Never shows an empty box | Weaker prose than a model |
| Heuristic class naming | Names the kind of mistake, not just the input | 70% accurate; published, not hidden |
| Own test suite as ground truth | Reproducible, runs in CI, no external dependency | Cannot cover a bug class we never thought of |
| Node `vm` over `isolated-vm` | Zero native dependencies | Not a real security boundary |
| Static snapshot gallery | Instant, failure-proof first paint | Can drift from the engine if not regenerated |

## Structural limits

**Shared misconceptions are invisible.** Differential testing finds disagreement,
so when both implementations hold the same wrong belief — the `NaN` maximum scan
above, or a matching off-by-one in both the submission and the oracle — there is
nothing to detect. This is inherent to the technique, not a bug in the
implementation, and it is the reason the built-in oracles are written for
naivety rather than cleverness.

**Type inference reads syntax.** It cannot see values arriving from a network, a
database, or reflection. The UI always displays the inferred schema so the gap
is visible rather than silent.