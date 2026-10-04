/**
 * Prove the generated regression suite is a real regression test.
 *
 *   npm run verify:regression-test
 *
 * A test file that only ever runs green proves nothing. The property that makes
 * these tests worth having is that they go RED against the vulnerable code and
 * stay green against the fix, while the legitimate-behaviour tests stay green in
 * both cases -- a fix that made the vulnerability disappear by breaking valid
 * input would otherwise pass.
 *
 * So this does both halves and asserts the outcome of each:
 *
 *   1. patched source   -> all tests pass
 *   2. vulnerable source -> the per-finding tests fail, the legitimate ones do not
 *
 * The second half runs the real vulnerable ReDoS, which takes roughly two
 * minutes of CPU by design -- that is the bug being demonstrated, and it is why
 * this check is not part of `npm run test:e2e`. It runs in CI as its own step
 * with a longer budget.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEGITIMATE_CASES, VULNERABILITIES } from '../server/target/app.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const generated = path.join(root, 'security-regression.test.mjs')
const vulnerableCopy = path.join(root, '.vulnerable-regression.test.mjs')

/** Run a test file and return its counts, without letting a failure abort us. */
function runSuite(file) {
  try {
    const stdout = execFileSync(process.execPath, ['--test', file], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10 * 60 * 1000,
    })
    return { code: 0, stdout }
  } catch (err) {
    return { code: err.status ?? 1, stdout: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

function counts(stdout) {
  // The summary block uses "ℹ pass N" / "ℹ fail N" on Node 20+, and TAP's
  // "# pass N" when run with the tap reporter. Accept both rather than pinning
  // to whichever this machine happens to print.
  const pass = /^(?:#|ℹ) pass (\d+)$/m.exec(stdout)
  const fail = /^(?:#|ℹ) fail (\d+)$/m.exec(stdout)
  return { pass: Number(pass?.[1] ?? 0), fail: Number(fail?.[1] ?? 0) }
}

if (!fs.existsSync(generated)) {
  console.error('security-regression.test.mjs is missing — run: npm run regression-test')
  process.exit(1)
}

// ---- 1. against the patched source, everything passes ------------------------
const patched = runSuite(generated)
const patchedCounts = counts(patched.stdout)
if (patched.code !== 0 || patchedCounts.fail > 0) {
  console.error(`FAIL  patched source: ${patchedCounts.fail} failing, exit ${patched.code}`)
  console.error(patched.stdout.split('\n').slice(-25).join('\n'))
  process.exit(1)
}
console.log(`ok   patched source: ${patchedCounts.pass} passing`)

// ---- 2. against the vulnerable source, the findings fail --------------------
let vulnerableSource = fs.readFileSync(generated, 'utf8')
let swapped = 0
for (const vuln of VULNERABILITIES) {
  if (vuln.patched && vulnerableSource.includes(vuln.patched)) {
    vulnerableSource = vulnerableSource.replace(vuln.patched, vuln.vulnerable)
    swapped += 1
  }
}
assert.equal(swapped, VULNERABILITIES.length, 'every patched source must be present in the generated file')

fs.writeFileSync(vulnerableCopy, vulnerableSource, 'utf8')
const vulnerable = runSuite(vulnerableCopy)
fs.rmSync(vulnerableCopy, { force: true })

const vulnerableCounts = counts(vulnerable.stdout)

// One failure per finding: V1, V2 and V3.
assert.ok(
  vulnerableCounts.fail >= VULNERABILITIES.length,
  `expected at least ${VULNERABILITIES.length} failures against the vulnerable source, got ${vulnerableCounts.fail}`,
)
console.log(`ok   vulnerable source: ${vulnerableCounts.fail} failing (one per finding)`)

// The legitimate-behaviour tests must STILL pass against vulnerable code: they
// describe behaviour the bugs never touched, so if they went red the generated
// file would be asserting the wrong thing.
// The legitimate-behaviour tests must STILL pass against vulnerable code: they
// describe behaviour the bugs never touched, so if they went red the generated
// file would be asserting the wrong thing.
//
// Asserted on the count rather than by matching output lines: the summary is
// stable, whereas the per-test reporter format differs between Node versions.
const legitTotal = LEGITIMATE_CASES.length
assert.equal(
  vulnerableCounts.pass,
  legitTotal,
  `expected all ${legitTotal} legitimate-behaviour tests to pass against vulnerable code, got ${vulnerableCounts.pass}`,
)
console.log(`ok   all ${legitTotal} legitimate-behaviour tests stay green against vulnerable code`)

console.log('\nThe generated suite is a genuine regression test: red on the bug, green on the fix.')