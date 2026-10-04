/**
 * Self-test: run every seeded example through the engine and assert that a
 * counterexample is found. This is the guard rail for the gallery -- if the
 * engine regresses, the landing page starts lying.
 *
 *   node server/engine/selftest.js
 */

import { analyze } from './analysis.js'
import { EXAMPLES, SECURITY_EXAMPLES, PROVENANCE_CASE } from '../examples.js'

const CASES = [...EXAMPLES, PROVENANCE_CASE]

let passed = 0
const failures = []

for (const example of CASES) {
  const started = Date.now()
  try {
    const report = await analyze(
      { code: example.code, functionName: example.code.match(/function\s+([A-Za-z0-9_$]+)/)?.[1], oracleSignature: example.oracleSignature },
      { budgets: { maxInputs: 2500, totalBudgetMs: 3000, shrinkBudgetMs: 4500 } },
    )

    if (report.status === 'counterexample-found') {
      passed += 1
      console.log(
        `PASS  ${example.id.padEnd(28)} ${String(report.finding.args ? report.minimal.size : '-').padStart(4)} cells  ` +
        `${report.minimal.call}`.padEnd(46) +
        `${report.analysisMs}ms  mutants ${report.mutationScore?.killed ?? '-'}/${report.mutationScore?.total ?? '-'}`,
      )
    } else {
      failures.push(`${example.id}: status=${report.status} ${report.message ?? ''}`)
      console.log(`FAIL  ${example.id.padEnd(28)} ${report.status} ${report.message ?? ''}`)
    }
  } catch (err) {
    failures.push(`${example.id}: ${err.message}`)
    console.log(`ERROR ${example.id.padEnd(28)} ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// Security validators.
//
// Held to a stricter standard than the cases above, in both directions. A
// "found a counterexample" assertion only proves the tool can complain; for a
// security finding the assertion that matters is that it names a *bypass*
// specifically. Anything else -- a wrong answer, a crash -- means the policy
// comparison is not doing what it claims.
// ---------------------------------------------------------------------------
let secPassed = 0
console.log('')

for (const example of SECURITY_EXAMPLES) {
  try {
    const report = await analyze(
      {
        code: example.code,
        functionName: example.code.match(/function\s+([A-Za-z0-9_$]+)/)?.[1],
      },
      { budgets: { maxInputs: 2500, totalBudgetMs: 3000, shrinkBudgetMs: 4500 } },
    )

    const found = report.status === 'counterexample-found' && report.finding
    if (found && report.finding.verdict === 'bypass') {
      secPassed += 1
      passed += 1
      console.log(
        `PASS  ${example.id.padEnd(28)} ${'bypass'.padEnd(46)}${report.minimal.call}`.padEnd(78) +
        `${report.analysisMs}ms  ${report.bugClass}`,
      )
    } else {
      const why = found ? `verdict=${report.finding.verdict ?? 'none'}` : `status=${report.status}`
      failures.push(`${example.id}: expected a bypass, got ${why}`)
      console.log(`FAIL  ${example.id.padEnd(28)} expected a bypass, got ${why}`)
    }
  } catch (err) {
    failures.push(`${example.id}: ${err.message}`)
    console.log(`ERROR ${example.id.padEnd(28)} ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// The direction that matters most, and the one a fuzzer is judged on: a
// *correct* validator must come back clean. A security tool that flags working
// code trains people to ignore it, which makes it worse than no tool.
// ---------------------------------------------------------------------------
const CLEAN_VALIDATORS = [
  {
    id: 'clean-validate-qty',
    code: `function validateQty(q) {
  if (typeof q !== 'number' || !Number.isFinite(q)) return 'not a number';
  if (!Number.isInteger(q)) return 'must be a whole number';
  if (q < 1) return 'must be positive';
  if (q > 100) return 'too many';
  return null;
}`,
  },
  {
    id: 'clean-validate-decimal',
    code: `function validateWeight(w) {
  if (typeof w !== 'number' || !Number.isFinite(w)) return 'not a number';
  if (w < 0.5) return 'too light';
  if (w > 50) return 'too heavy';
  return null;
}`,
  },
  {
    id: 'clean-validate-score',
    code: `function checkScore(s) {
  if (typeof s !== 'number' || !Number.isFinite(s)) return 'not a number';
  if (s < 0) return 'negative';
  if (s > 5) return 'out of range';
  return null;
}`,
  },
]

console.log('')
for (const subject of CLEAN_VALIDATORS) {
  try {
    const report = await analyze(
      { code: subject.code, functionName: subject.code.match(/function\s+([A-Za-z0-9_$]+)/)?.[1] },
      { budgets: { maxInputs: 2500, totalBudgetMs: 3000, shrinkBudgetMs: 3000 } },
    )
    if (report.status === 'no-counterexample-found') {
      passed += 1
      console.log(`PASS  ${subject.id.padEnd(28)} no false positive on a correct validator`)
    } else {
      failures.push(
        `${subject.id}: false positive -- ${report.finding?.verdict ?? report.status} ` +
        `${report.minimal?.call ?? ''}`,
      )
      console.log(
        `FAIL  ${subject.id.padEnd(28)} FALSE POSITIVE ` +
        `${report.finding?.verdict ?? report.status} ${report.minimal?.call ?? ''}`,
      )
    }
  } catch (err) {
    failures.push(`${subject.id}: ${err.message}`)
    console.log(`ERROR ${subject.id.padEnd(28)} ${err.message}`)
  }
}

console.log(
  `\n${passed}/${CASES.length + SECURITY_EXAMPLES.length + CLEAN_VALIDATORS.length} ` +
  `checks pass (${CASES.length} counterexamples, ${SECURITY_EXAMPLES.length} security bypasses, ` +
  `${CLEAN_VALIDATORS.length} correct validators).`,
)
console.log(`Security: ${secPassed}/${SECURITY_EXAMPLES.length} validators bypassed as expected.`)

if (failures.length) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}