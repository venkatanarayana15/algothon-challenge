import type { AnalysisReport } from '../types'
import { detectFunctionName } from './format'

/**
 * A one-line guard that closes a validation bypass.
 *
 * This is the tool doing what the problem statement asks for — *apply a safe
 * fix, then retest to prove it held* — instead of stopping at "here is your
 * bug". It is deliberately narrow, because an automated edit to someone's
 * source is only defensible when the edit is provably safe:
 *
 * - **Only for `bypass`, only for a numeric parameter, only when the engine
 *   reported that the parameter's own source does not check finiteness.** That
 *   last flag is the engine reading the author's comparisons; we do not guess
 *   it. A validator whose parameter is legitimately not a number gets no
 *   suggestion at all.
 * - **The rejection statement is reused from the author's own code.** We take
 *   the first `return <expr>;` in the function body and return that same
 *   expression from the guard, so the fix matches their convention — an error
 *   string stays an error string, and a boolean `return false` stays `false`.
 *   Inventing `return false` for a validator that returns messages would have
 *   inverted its meaning, which is worse than offering nothing.
 * - **Nothing is applied without a click,** and the previous source is kept so
 *   it can be restored.
 *
 * The finiteness guard is the minimal fix for the whole family: `true`, `null`,
 * `""`, `NaN` and `Infinity` all pass a comparison-only range check.
 */
export interface SuggestedFix {
  /** The exact line that will be inserted as the first statement. */
  guard: string
  /** The parameter it guards, as the author named it. */
  param: string
  /** Why the input class slips through today. */
  reason: string
  /** Inserts the guard; null when the function body cannot be located. */
  apply: (code: string) => string | null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Index of the `{` that opens the named function's body. */
function bodyOpenIndex(code: string, functionName: string): number | null {
  const name = functionName.trim() || detectFunctionName(code)
  if (!name) return null
  const signature = new RegExp(`function\\s+${escapeRegExp(name)}\\s*\\(`)
  const match = signature.exec(code)
  if (!match) return null
  const open = code.indexOf('{', match.index + match[0].length)
  return open === -1 ? null : open
}

/**
 * The author's own rejection expression: the first `return` in the body.
 *
 * Requiring at least two returns is what makes this safe to assume. A validator
 * has a reject path and an accept path; a function with a single return has no
 * convention to borrow, so we decline rather than impose one.
 */
function rejectionExpression(code: string, functionName: string): string | null {
  const open = bodyOpenIndex(code, functionName)
  if (open === null) return null
  const body = code.slice(open + 1)
  const returns = [...body.matchAll(/return\s+([^;\n]+);/g)].map((match) => match[1].trim())
  if (returns.length < 2) return null
  return returns[0]
}

export function suggestFix(report: AnalysisReport | null, code: string): SuggestedFix | null {
  if (!report || report.status !== 'counterexample-found') return null
  if (report.finding?.verdict !== 'bypass') return null

  const param = report.params[0]
  if (!param || param.type !== 'number') return null
  // The engine read the author's own comparisons; only act when it says the
  // finiteness check is missing. Absence of the flag means we do not know.
  if (param.checksFinite !== false) return null

  const rejection = rejectionExpression(code, report.functionName)
  if (!rejection) return null

  const guard = `if (typeof ${param.name} !== 'number' || !Number.isFinite(${param.name})) return ${rejection};`

  return {
    guard,
    param: param.name,
    reason:
      `Every comparison against NaN is false, and \`true\`, \`null\` and \`""\` compare false against ` +
      `both bounds too — so \`${param.name}\` passes a range check built only from comparisons.`,
    apply: (source: string) => {
      const open = bodyOpenIndex(source, report.functionName)
      if (open === null) return null
      return `${source.slice(0, open + 1)}\n  ${guard}${source.slice(open + 1)}`
    },
  }
}
