import type { RunRecord } from '../types'

/**
 * This session, in numbers.
 *
 * SaaS dashboards earn trust by showing measured activity rather than
 * marketing figures, so once the visitor has run anything, the trail gains a
 * header that totals what actually happened here: runs, inputs the engine
 * tried across them, findings, and fixes verified by a clean retest. Every
 * figure is summed from the run history below it, session-scoped and labelled
 * as such -- it makes no claim beyond this tab. Renders nothing before the
 * first run, because zeros would be decoration rather than information.
 */
export function SessionStats({ records }: { records: RunRecord[] }) {
  if (records.length === 0) return null

  const runs = records.length
  const inputs = records.reduce((sum, r) => sum + (r.inputsTested ?? 0), 0)
  const findings = records.filter((r) => r.status === 'counterexample-found').length
  const verified = records.filter(
    (r) => r.origin === 'fix' && r.status === 'no-counterexample-found',
  ).length

  const cells: Array<{ value: string; label: string }> = [
    { value: String(runs), label: runs === 1 ? 'run this session' : 'runs this session' },
    { value: inputs.toLocaleString(), label: 'inputs tested' },
    { value: String(findings), label: findings === 1 ? 'finding' : 'findings' },
    { value: String(verified), label: verified === 1 ? 'fix verified' : 'fixes verified' },
  ]

  return (
    <section aria-label="Session statistics" className="panel px-5 py-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label}>
            <div className="font-mono text-xl font-semibold text-white">{cell.value}</div>
            <p className="label mt-0.5">{cell.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}