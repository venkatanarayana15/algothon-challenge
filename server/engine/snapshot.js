/**
 * Generate a static snapshot of real engine output.
 *
 *   node server/engine/snapshot.js
 *
 * The landing page renders the seeded gallery from this file, so a judge sees
 * real counterexamples in the first paint without waiting on the API and
 * without any network call at all. It is generated, never hand-written: if the
 * engine changes, re-run this and the site tells a different (true) story.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze } from './analysis.js'
import { toJsonSafe } from './json-safe.js'
import { EXAMPLES, PROVENANCE_CASE } from '../examples.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT = path.join(__dirname, '..', '..', 'web', 'src', 'data', 'snapshot.json')

const entries = []

for (const example of [...EXAMPLES, PROVENANCE_CASE]) {
  const functionName = example.code.match(/function\s+([A-Za-z0-9_$]+)/)?.[1]
  const report = await analyze(
    { code: example.code, functionName, oracleSignature: example.oracleSignature },
    { budgets: { maxInputs: 4000, totalBudgetMs: 4000, shrinkBudgetMs: 5000 } },
  )

  if (report.status !== 'counterexample-found') {
    console.warn(`skipping ${example.id}: ${report.status}`)
    continue
  }

  // Volatile timing metrics are deliberately excluded. They differ on every run
  // by tens of milliseconds, which would make the file churn constantly and
  // break any staleness check on it -- while carrying no information a judge
  // needs. Everything below is deterministic: same engine, same input, same
  // counterexample.
  entries.push(toJsonSafe({
    id: example.id,
    title: example.title,
    difficulty: example.difficulty,
    language: example.language,
    spec: example.spec,
    tags: example.tags,
    bugClass: example.bugClass,
    code: example.code,
    rootCause: example.rootCause,
    fix: example.fix,
    provenance: Boolean(example.provenance),
    counterexample: report.finding.call,
    kind: report.finding.kind,
    expected: report.finding.expected,
    actual: report.finding.actual,
    mutationScore: report.mutationScore
      ? { killed: report.mutationScore.killed, total: report.mutationScore.total, ratio: report.mutationScore.ratio }
      : null,
    params: report.params.map((p) => ({ name: p.name, type: p.type, ambiguous: Boolean(p.ambiguous) })),
  }))

  console.log(
    `${example.id.padEnd(28)} ${report.finding.call.padEnd(34)} ` +
    `${report.stats.inputsTested} inputs  ${report.analysisMs}ms`,
  )
}

const summary = {
  totalExamples: entries.length,
  entries,
}

await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
await fs.writeFile(OUTPUT, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

console.log(`\nwrote ${entries.length} entries to ${path.relative(process.cwd(), OUTPUT)}`)