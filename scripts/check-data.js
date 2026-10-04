/**
 * Data staleness check.
 *
 *   node scripts/check-data.js
 *
 * Regenerates `web/src/data/*.json` and compares it against what is committed,
 * then exits non-zero if the committed copy is out of date.
 *
 * Why this is not just `git diff -- web/src/data`:
 *
 * Two parts of the benchmark output are not reproducible run to run, by
 * design rather than by defect.
 *
 *   1. Timing and input counts. How many inputs the fuzzer gets through before
 *      it finds (or fails to find) a bug depends on wall-clock timing.
 *   2. The observation fields of the `non-determinism` case. `noisyTotal`
 *      injects random noise, so *many* distinct inputs break it, which one the
 *      fuzzer lands on first is arbitrary, and on any given run it may land on
 *      an input that merely returns a different answer (`wrong-answer`) rather
 *      than one that disagrees twice (`nondeterministic`). Pinning any of that
 *      would be pinning an arbitrary choice, not a fact. What is stable and
 *      what matters -- that the bug is found at all -- is still checked.
 *
 * Everything else -- every rate, every pass/fail, every classification, every
 * other counterexample -- must be identical, and that is what this enforces. If
 * a detection rate or a false positive changes, the committed data is stale and
 * the site is showing numbers we can no longer reproduce.
 */

import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { BENCHMARK_CASES } from '../server/benchmarks.js'

const DATA_DIR = new URL('../web/src/data/', import.meta.url)

const run = (script, args = []) =>
  spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' }).status ?? 1

/** Per-case truth labels whose subjects are intentionally non-deterministic. */
const NONDETERMINISTIC = new Set(
  BENCHMARK_CASES.filter((c) => c.truth === 'non-determinism').map((c) => c.id),
)

/**
 * Reduce a generated file to only the parts that must be reproducible.
 * Anything an honest run cannot pin is dropped here explicitly, so the list of
 * what we tolerate stays visible rather than becoming "ignore whatever fails".
 */
function normalize(fileName, parsed) {
  if (fileName === 'benchmark.json') {
    return {
      summary: parsed.summary,
      classes: parsed.classes,
      rows: parsed.rows.map((r) => {
        if (!NONDETERMINISTIC.has(r.id)) return r
        // Keep only what a random subject still determines. `found` is the
        // load-bearing one: if a regression stopped us detecting this bug at
        // all, the detection rate in `summary` would move and this fails too.
        return { id: r.id, expect: r.expect, truth: r.truth, found: r.found }
      }),
    }
  }
  return parsed
}

const readNormalized = async (fileName) => {
  const text = await readFile(new URL(fileName, DATA_DIR), 'utf8')
  return JSON.stringify(normalize(fileName, JSON.parse(text)), null, 2)
}

const files = ['snapshot.json', 'benchmark.json']

// Capture the committed state first: the generators below overwrite in place.
const before = new Map()
for (const file of files) before.set(file, await readNormalized(file))

const snapshotStatus = run(fileURLToPath(new URL('../server/engine/snapshot.js', import.meta.url)))
const benchmarkStatus = run(
  fileURLToPath(new URL('../server/engine/benchmark.js', import.meta.url)),
  ['--json'],
)
if (snapshotStatus !== 0 || benchmarkStatus !== 0) {
  console.error('\n::error::regeneration failed, cannot judge staleness')
  process.exit(1)
}

let stale = false
for (const file of files) {
  const after = await readNormalized(file)
  if (after !== before.get(file)) {
    stale = true
    console.error(`\n::error::web/src/data/${file} is stale.`)
    const path = file === 'snapshot.json' ? 'npm run snapshot' : 'npm run benchmark -- --json'
    console.error(`Run '${path}' and commit the result.`)
  }
}

if (stale) {
  // Keep the regenerated files so the drift is visible in the diff.
  process.exit(1)
}

console.log('\nweb/src/data is up to date (deterministic fields match).')