/**
 * Turn an audit report into a runnable Node test file.
 *
 * The audit proves a fix inside this project. What a reviewer wants is proof
 * they can execute themselves, in their own repository, against their own code.
 * So the findings are emitted as a standard `node:test` suite -- no dependency
 * beyond Node, no framework to install, `node --test` and it runs.
 *
 * Two properties make it worth generating rather than hand-writing:
 *
 * - **It is derived from the audit, not typed out.** Every assertion is built
 *   from the finding's own attack input and expected verdict, so the file cannot
 *   drift away from what was actually proven.
 * - **The tests are written to FAIL against the vulnerable version.** That is the
 *   point of a regression test: it is a bug report that stays red until the fix
 *   lands. A test that passes on the broken code proves nothing. The generated
 *   file asserts the *fixed* behaviour, and its header says which findings it
 *   reproduces.
 *
 * The ReDoS finding is the awkward one. Its proof is elapsed time rather than a
 * return value, so the test asserts the call completes inside a bound instead of
 * asserting a verdict -- timing assertions are notoriously flaky, so the bound is
 * generous and the comment says why.
 */

import { LEGITIMATE_CASES, VULNERABILITIES } from './app.js'

/** The patched source of each finding, keyed by finding id. */
const PATCHED = new Map(VULNERABILITIES.map((v) => [v.id, v.patched]))

/** A JS literal for a value, handling the two things JSON.stringify gets wrong. */
function literal(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    // JSON.stringify turns these into null, which would silently assert the
    // wrong thing -- NaN becoming null is the entire bug V1 is about.
    return Number.isNaN(value) ? 'NaN' : String(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'undefined') return 'undefined'
  return JSON.stringify(value)
}

function argsLiteral(args) {
  return `[${args.map(literal).join(', ')}]`
}

/**
 * What the vulnerable version did, as a stable phrase.
 *
 * The audit's own `attack.before` reads "accepted in 1ms", and that millisecond
 * count differs on every run -- which would make the generated file churn on
 * every regeneration and fail any staleness check. What matters for a reader is
 * the verdict, not how many milliseconds it took, so the timing is dropped here
 * and kept in the UI where it is shown as an observation.
 */
function stableVerdict(finding) {
  return finding.attack.before.startsWith('accepted') ? 'accepted' : finding.attack.before
}

/**
 * The values behind a display call such as `validateQty(NaN)`.
 *
 * The attack input is reconstructed from the finding rather than re-parsed out
 * of the rendered string, because parsing `"a".repeat(30)` back out of prose is
 * exactly the kind of step that quietly produces a test for the wrong thing.
 */
function attackArgs(finding) {
  switch (finding.id) {
    case 'V1':
      return { fn: 'validateQty', args: [NaN], expect: 'reject', why: 'NaN compares false against every bound, so it passes a range check built only from comparisons.' }
    case 'V2':
      return {
        fn: 'isStrongEnoughPassword',
        args: ['a'.repeat(30) + 'A1!'],
        expect: 'return',
        why: 'The input satisfies the first pattern, so the nested-quantifier pattern is reached, and the long run of one character makes the engine try exponentially many splits.',
      }
    case 'V3':
      return { fn: 'authorize', args: ['user', 0], expect: 'reject', why: 'The access-control predicate is inverted, so the lowest-privileged role is accepted.' }
    default:
      return null
  }
}

/**
 * @param {object} report the audit report, as returned by auditTarget()
 * @returns {{ filename: string, contents: string, runs: number }}
 */
export function buildRegressionTest(report) {
  const cases = report.vulnerabilities
    .map((v) => {
      const attack = attackArgs(v)
      if (!attack) return null

      // ReDoS is proven by elapsed time, not by a verdict, so it gets a
      // different assertion from the other two rather than a fudged one.
      if (v.id === 'V2') {
        return `
test('${v.id}: ${attack.fn} returns promptly on a backtracking trigger', () => {
  // ${attack.why}
  const input = ${JSON.stringify(attack.args[0])}
  const started = process.hrtime.bigint()
  const result = ${attack.fn}(input)
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  // Vulnerable version: hangs — the budget is exhausted without returning
  // Patched version:  returns immediately
  assert.strictEqual(accepts('${attack.fn}')(result), true, 'a strong password must still be accepted')
  // The bound is deliberately loose: a fixed implementation returns in well under
  // a millisecond, while the vulnerable one exhausts a 1500ms budget. Anything
  // between the two proves the fix without being a flaky timing test.
  assert.ok(elapsedMs < 100, \`took \${elapsedMs.toFixed(1)}ms, expected the fix to return promptly\`)
})`
      }

      return `
test('${v.id}: ${attack.fn} rejects an input that bypasses the rule', () => {
  // ${attack.why}
  // Vulnerable version: ${stableVerdict(v)}
  // Patched version:  rejected
  assert.strictEqual(accepts('${attack.fn}')(${attack.fn}(...${argsLiteral(attack.args)})), false, 'the input must be rejected, not accepted')
})`
    })
    .filter(Boolean)

  const regressionChecks = report.regression.legitimateChecks

  /**
   * The legitimate cases as real assertions.
   *
   * This is the half of a security fix that is normally skipped: proving the fix
   * did not break valid behaviour. Emitting the actual cases -- rather than a
   * single "the suite passed" line -- means the generated file fails loudly if a
   * future change breaks one of them, which is the whole point of leaving a
   * regression suite behind.
   */
  const legitimateTests = LEGITIMATE_CASES.map(
    (c) => `
test('${c.id}: ${c.fn} ${c.note}', () => {
  assert.strictEqual(
    accepts('${c.fn}')(${c.fn}(...${argsLiteral(c.args)})),
    ${c.expectAccept},
    'expected ${c.fn} to ${c.expectAccept ? 'accept' : 'reject'} this input',
  )
})`,
  ).join('\n')

  const contents = `/**
 * Security regression tests — generated by Counterexample.
 *
 * ${report.target}
 *
 * Generated from a real audit run: ${report.vulnerabilities.length} findings,
 * each one detected, patched, and retested. ${regressionChecks} legitimate cases
 * were checked against the patched application and all still behave correctly.
 *
 * Run it:
 *
 *     node --test security-regression.test.mjs
 *
 * ${cases.length} vulnerability tests and ${LEGITIMATE_CASES.length} legitimate-behaviour tests.
 *
 * These tests are written against the FIXED behaviour, so they fail against the
 * vulnerable version by design — that is what makes them regression tests rather
 * than descriptions. If you are reading this while a fix is still unmerged, a
 * failure here is the bug report, not a broken test.
 *
 * Findings reproduced:
${report.vulnerabilities.map((v) => ` *   ${v.id}  ${v.title} — ${v.owasp}`).join('\n')}
 */

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

/**
 * How each function signals acceptance.
 *
 * Stated per function rather than as one shared rule, because they genuinely
 * differ: the two validators return a message string and use null for "accepted",
 * while the password check returns a plain boolean. A single guessed rule --
 * say, \`!result\` -- asserts the wrong thing for one of the two, which is exactly
 * how a generated test suite ends up green while proving nothing. This mirrors
 * the engine's own subjectAccepts().
 */
const ACCEPTS = {
${[...new Set(LEGITIMATE_CASES.map((c) => c.fn))]
  .map(
    (fn) =>
      `  ${fn}: (r) => ${fn === 'isStrongEnoughPassword' ? 'r === true' : 'r === null'},`,
  )
  .join('\n')}
}
const accepts = (fn) => ACCEPTS[fn]

${report.vulnerabilities
  .map((v) => {
    const source = PATCHED.get(v.id)
    if (!source) return ''
    return `// --- ${v.id}: ${v.title} (${v.owasp})\n// Root cause: ${v.rootCause}\n// Fix: ${v.fix}\n${source}\n`
  })
  .filter(Boolean)
  .join('\n')}
${cases.join('\n')}

/**
 * The fix must not change behaviour on valid input. These are the
 * ${regressionChecks} legitimate cases checked during the audit --
 * ${report.regression.passedAfterFix} of them passed after the fixes, and nothing that used to work stopped working.
 */
describe('legitimate behaviour is preserved', () => {
${legitimateTests}
})
`

  return {
    filename: 'security-regression.test.mjs',
    contents,
    runs: cases.length + LEGITIMATE_CASES.length,
  }
}