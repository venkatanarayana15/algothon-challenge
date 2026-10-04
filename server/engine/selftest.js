/**
 * Self-test: run every seeded example through the engine and assert that a
 * counterexample is found. This is the guard rail for the gallery -- if the
 * engine regresses, the landing page starts lying.
 *
 *   node server/engine/selftest.js
 */

import { analyze } from './analysis.js'
import { EXAMPLES, PROVENANCE_CASE } from '../examples.js'

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

console.log(`\n${passed}/${CASES.length} examples produce a counterexample.`)

if (failures.length) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}