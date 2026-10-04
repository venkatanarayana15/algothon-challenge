/**
 * Triage labels for a detected bug class: how bad, and what it usually is.
 *
 * Honesty rules for this file, because a security claim is easy to overstate:
 *
 * - The severity is **ours**, not a standard. It is a judgement about how far
 *   the wrong value propagates, and it is labelled as a judgement in the UI.
 * - An OWASP category or CWE id appears **only where one genuinely fits**.
 *   `validation-bypass` really is improper input validation reaching an
 *   injection sink, and `non-termination` really is an unreachable exit
 *   condition. `ordering-contract` is not a CWE at all, so it gets none rather
 *   than a plausible-looking number.
 *
 * The point is triage — which finding do I look at first — not a formal
 * assessment, and the copy in the UI says so.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface Triage {
  severity: Severity
  /** OWASP Top 10 (2021) category, where the class genuinely maps to one. */
  owasp?: string
  /** Closest CWE, where one genuinely fits. Absent is a deliberate choice. */
  cwe?: string
  /** One line on why that severity, for whoever disagrees with it. */
  reason: string
}

const CLASS_TRIAGE: Record<string, Triage> = {
  'validation-bypass': {
    severity: 'critical',
    owasp: 'A03:2021 Injection',
    cwe: 'CWE-20 Improper Input Validation',
    reason:
      'Untrusted input reaches the rest of the program through the check that exists to stop it. The wrong answer here is not a wrong number, it is a bypass.',
  },
  'non-finite': {
    severity: 'high',
    cwe: 'CWE-681 Incorrect Conversion between Numeric Types',
    reason:
      'NaN and Infinity propagate through arithmetic and comparisons silently, and every comparison against NaN is false.',
  },
  'non-termination': {
    severity: 'high',
    cwe: 'CWE-835 Loop with Unreachable Exit Condition',
    reason:
      'An unbounded loop driven by attacker-controlled input is a denial of service, not just a hang.',
  },
  'missing-base-case': {
    severity: 'high',
    cwe: 'CWE-674 Uncontrolled Recursion',
    reason: 'Recursion without a reachable base case exhausts the stack.',
  },
  'empty-input': {
    severity: 'medium',
    cwe: 'CWE-20 Improper Input Validation',
    reason:
      'The empty case produces NaN, undefined or a crash instead of a decision, so the boundary of the domain is unhandled.',
  },
  'wrong-comparison': {
    severity: 'medium',
    cwe: 'CWE-697 Incorrect Comparison',
    reason: 'A comparison points the wrong way, which inverts a guard or a predicate.',
  },
  'empty-sentinel': {
    severity: 'medium',
    cwe: 'CWE-457 Use of Uninitialized Variable',
    reason: 'A sentinel initial value is returned as though it were a real result.',
  },
  'negative-domain': {
    severity: 'medium',
    cwe: 'CWE-682 Incorrect Calculation',
    reason: 'Sign handling disagrees with the stated domain, so results are wrong on one half of it.',
  },
  'modulo-sign': {
    severity: 'medium',
    cwe: 'CWE-682 Incorrect Calculation',
    reason:
      'JavaScript modulo keeps the dividend sign, so a negative index wraps outward instead of inward.',
  },
  'off-by-one': {
    severity: 'medium',
    cwe: 'CWE-193 Off-by-one Error',
    reason: 'A bound or an index is one element out, so one element is silently dropped or read.',
  },
  'ordering-contract': {
    severity: 'low',
    reason: 'Output order is part of the contract, and it is not preserved.',
  },
  'duplicates-ignored': {
    severity: 'low',
    reason: 'Duplicate handling is unspecified, so behaviour is quietly wrong on repeated values.',
  },
  'non-determinism': {
    severity: 'low',
    cwe: 'CWE-330 Use of Insufficiently Random Values',
    reason: 'Hidden state makes the same input produce a different answer, so any test can pass by luck.',
  },
}

export function triageFor(bugClass?: string | null): Triage | null {
  if (!bugClass) return null
  return CLASS_TRIAGE[bugClass] ?? null
}

export const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
  high: 'border-amber-500/35 bg-amber-500/10 text-amber-200',
  medium: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  low: 'border-white/[0.08] bg-white/[0.03] text-slate-400',
}
