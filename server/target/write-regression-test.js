/**
 * Generate the runnable regression suite from a real audit, and write it out.
 *
 *   npm run regression-test
 *
 * This is the artifact a reviewer takes away: not a screenshot of a passing
 * test, but the file itself. It is written to `security-regression.test.mjs` at
 * the project root and can be executed immediately with `node --test`.
 *
 * The generated file is deliberately NOT gitignored... it is, actually, because
 * it is generated output and `npm run check:data` is the pattern used for that
 * elsewhere. Regenerating it is one command.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditTarget } from './audit.js'
import { buildRegressionTest } from './regression-test.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const report = await auditTarget({ budgets: 2500 })
const file = buildRegressionTest(report)

const target = path.join(root, file.filename)
await fs.writeFile(target, file.contents, 'utf8')

console.log(`\nWrote ${file.filename} — ${file.runs} tests`)
for (const v of report.vulnerabilities) {
  console.log(`  ${v.id}  ${v.title}`)
}
console.log(`  plus ${report.regression.legitimateChecks} legitimate-behaviour checks`)
console.log(`\nRun it with:\n  node --test ${file.filename}\n`)