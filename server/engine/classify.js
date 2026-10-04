/**
 * Bug classification.
 *
 * Given a counterexample and the source that produced it, name the *kind* of
 * bug. This is what turns "here is a failing input" into "here is the class of
 * mistake you made", which is the difference between a tool that finds bugs
 * and one that teaches.
 *
 * Classification is evidence-based, not name-based: it reads the actual
 * arguments in the minimal counterexample and the shape of the failing call.
 * A tool that keyed off function names would look impressive in a demo and
 * collapse on real code.
 */

const has = (args, predicate) => args.some(predicate)
const isEmptyArray = (v) => Array.isArray(v) && v.length === 0
const isNonFinite = (v) => typeof v === 'number' && !Number.isFinite(v)
const isNegative = (v) => typeof v === 'number' && v < 0

/**
 * @param {object} finding  the finding from the engine
 * @param {string} source   the user's source
 * @returns {string} a class from BUG_CLASSES, or 'unknown'
 */
export function classifyFinding(finding, source) {
  if (!finding) return 'unknown'
  const args = finding.args ?? []

  // The engine already distinguishes this one precisely -- it observed the
  // same input returning two different values.
  if (finding.kind === 'nondeterministic') return 'non-determinism'

  // A validator was asked to accept an input its policy rejects. The engine
  // observed this directly, so it is more precise than anything the argument
  // evidence below could infer, and it is checked first for that reason.
  //
  // The dominant cause is type coercion: `if (q <= 0)` written for numbers is
  // silently satisfied by `true`, `null` and `""`, because every one of those
  // compares false against both bounds. `NaN` and `Infinity` do the same. The
  // fix is to check the type before the range, not to add more comparisons.
  if (finding.verdict) return 'validation-bypass'

  // A timeout on a self-referential function is a recursion problem. This must
  // be checked before the argument evidence: `fib(-1)` fails on a negative
  // argument, but the bug is the incomplete guard, not the sign.
  if (finding.kind === 'timeout') {
    return looksRecursive(source) ? 'missing-base-case' : 'non-termination'
  }

  // A recursive function that fails on a small input is missing a base case,
  // whatever the argument happens to be.
  if (looksRecursive(source) && has(args, (v) => typeof v === 'number' && Math.abs(v) <= 1)) {
    if (/\bn\s*===\s*0\b|\w+\s*===\s*0\s*\)|<=\s*1\s*\)/.test(source)) return 'missing-base-case'
  }

  // Evidence 1: the arguments themselves.
  if (has(args, isEmptyArray)) {
    // Distinguish "the empty case is unhandled" from "a sentinel value leaks
    // out on the empty case". Both present identically at runtime, so the
    // source decides.
    if (/=\s*-\s*Infinity/.test(source) || /=\s*(?:Infinity|Number\.MAX_SAFE_INTEGER)\b/.test(source)) {
      return 'empty-sentinel'
    }
    return 'empty-input'
  }

  if (has(args, isNonFinite)) return 'non-finite'

  if (has(args, isNegative)) {
    // Two distinct negative-domain failures look identical at runtime, so the
    // source has to disambiguate:
    //   - a raw `%` on a possibly-negative operand -> modulo keeps the sign of
    //     the dividend in JavaScript, so the remainder comes out negative;
    //   - a loop or comparison guard like `while (b > 0)` that exits early.
    const normalisesSign = /Math\.abs\s*\(/.test(source)
    if (normalisesSign) return 'unknown'

    const rawModulo = /%/.test(source)
    // `x % y` feeding an array slice index, with no normalisation, is the
    // classic modulo-sign bug.
    if (rawModulo && /(?:slice|splice|\[\s*\w+\s*%|-=\s*\w+\s*%)/.test(source)) return 'modulo-sign'
    // A guard that requires positivity, absent an abs(), is a sign bug.
    if (/while\s*\(\s*\w+\s*[<>]=?\s*0\s*\)|if\s*\(\s*\w+\s*[<>]\s*0\s*\)/.test(source)) return 'negative-domain'
    if (rawModulo) return 'modulo-sign'
    return 'negative-domain'
  }

  // Evidence 1b: a wrong type reaching a value the function indexes or
  // measures. `s[undefined]` and `s.length - 1` on a non-string both throw.
  if (has(args, (v) => v === null || v === undefined)) {
    return /(?:\.length|\[\s*\w*\s*\])/.test(source) ? 'empty-input' : 'non-finite'
  }

  // Evidence 1c: a thrown exception whose message points at an index or a
  // method call on the wrong shape.
  if (finding.kind === 'threw') {
    if (/Cannot read properties of (?:undefined|null)/.test(finding.error ?? finding.errorMessage ?? '')) {
      return /(?:\.length|\[\s*\w*\s*\])/.test(source) ? 'empty-input' : 'non-finite'
    }
    return 'unknown'
  }

  // Evidence 2: the source shape, once the arguments are inconclusive.
  if (/(?:Math\.random|Date\.now|new\s+Date|performance\.now)/.test(source)) return 'non-determinism'

  if (/(?:sort\s*\(|\.sort\()/.test(source) && /new\s+Set|dedup|uniq|distinct/i.test(source)) {
    return 'ordering-contract'
  }

  if (/secondLargest|runnerUp|second\s*(?:largest|max)|largest\s*other/i.test(source)) {
    return 'duplicates-ignored'
  }

  // A loop bound that stops one element short of the natural end. This is only
  // an off-by-one when the body consumes every element it visits; when the
  // minimal counterexample is an empty array instead, the empty case is the
  // real cause and the short bound merely exposes it.
  if (/<\s*\w+\.length\s*-\s*1/.test(source)) {
    const failingEmpty = has(args, isEmptyArray)
    if (failingEmpty) return 'empty-input'
    return 'off-by-one'
  }

  // Two indices walking toward each other. If they advance in lockstep the
  // logic is sound; if only one of them moves, the scan skips a comparison and
  // that is an off-by-one. A comparison that returns `false` early on `!==`
  // in a palindrome-shaped loop is an inverted predicate instead.
  if (/\w+\s*=\s*0\s*,\s*\w+\s*=\s*\w+\.length\s*-\s*1/.test(source)) {
    const mixedIncrement = /\+\+\s*;\s*\w+\s*\+\+\s*;?\s*\}\s*$/.test(source)
      || /\+\+\s*;\s*\w+\s*\+\s*\+/.test(source)
      || /\w+\s*\+\+\s*;\s*\w+\s*\+\s*\+/.test(source)
    if (!mixedIncrement) return 'off-by-one'
    return 'wrong-comparison'
  }

  // A boolean predicate that returns a literal from inside a loop over
  // comparisons: the direction of the comparison decides correctness.
  if (/return\s+(?:true|false)\s*;?/.test(source) && /[<>]=?/.test(source) && !/\+=/.test(source)) {
    return 'wrong-comparison'
  }

  if (/=\s*-\s*Infinity/.test(source)) return 'empty-sentinel'

  if (/looksRecursive|return\s+\w+\s*[\(.]*\w*\s*\+/.test(source) && looksRecursive(source)) {
    return 'missing-base-case'
  }

  // A comparison that returns early from a boolean function.
  if (/return\s+(?:true|false)\s*;?\s*\}\s*$/m.test(source) && /[<>]=?/.test(source)) {
    return 'wrong-comparison'
  }

  return 'unknown'
}

/**
 * Detect self-recursion by looking for the target function calling itself.
 * Cheap and deliberately conservative -- a false positive here would mislabel
 * a whole bug class, so we require the call to be inside the function body.
 */
export function looksRecursive(source) {
  const names = [...source.matchAll(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((m) => m[1])
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // A call to itself that is not the declaration itself.
    if (new RegExp(`(?<!function\\s)${escaped}\\s*\\(`).test(source)) return true
  }
  const arrowNames = [...source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)]
    .map((m) => m[1])
  for (const name of arrowNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`${escaped}\\s*\\(`).test(source)) return true
  }
  return false
}

/** Human-readable next step for a class. */
export const CLASS_ADVICE = {
  'off-by-one': 'Audit every loop bound and index arithmetic. One comparison is one element too few.',
  'empty-input': 'Decide explicitly what the function returns for an empty collection, and handle it before indexing.',
  'missing-base-case': 'Check that the recursion guard covers every valid input, including the smallest one.',
  'wrong-comparison': 'Verify the direction of each comparison against the stated intent, not against habit.',
  'non-finite': 'Reject or handle NaN and Infinity before they enter arithmetic or comparisons.',
  'empty-sentinel': 'Do not use a sentinel initial value as a return value. Branch on the empty case.',
  'duplicates-ignored': 'State whether duplicates are meaningful, then encode that in the invariant.',
  'ordering-contract': 'If the output order is part of the contract, do not sort as a side effect.',
  'negative-domain': 'Normalise the sign at the boundary, before any comparison or modulo.',
  'modulo-sign': 'Normalise modulo with ((k % n) + n) % n; JavaScript keeps the sign of the dividend.',
  'non-determinism': 'Remove hidden state: Math.random, Date.now, and mutation of shared arrays.',
  'non-termination': 'Bound the loop or iteration explicitly rather than relying on input shape.',
  'validation-bypass':
    'Check the type before the range. `if (q <= 0)` is silently satisfied by true, null, "", NaN and Infinity, because every one of those compares false against both bounds. Number.isInteger(q) first, then the range.',
  unknown: 'Compare your two implementations line by line and find the first branch that differs.',
}