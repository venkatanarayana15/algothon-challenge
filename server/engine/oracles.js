/**
 * Oracles: a second, independent implementation to disagree with.
 *
 * The test-oracle problem is the hard part of property-based testing: without a
 * reference implementation you can only check for crashes, not wrong answers.
 * Two ways out, both used here:
 *
 *  1. A library of pre-written, deliberately naive oracles for common problem
 *     classes. Zero network, zero latency, works when every API is down.
 *  2. LLM synthesis for anything not in the library. Optional by design: if the
 *     key is missing or the call fails, we degrade to crash-only detection
 *     rather than showing an error page.
 *
 * Oracles in the library are written for speed and naivety, never for
 * elegance -- that is the point. An oracle that shares a bug with the
 * submission would be worse than useless.
 */

import { callFn, compile, deepEqual, isTimeout } from './sandbox.js'

/** Naive reference implementations, keyed by a short signature. */
export const ORACLE_LIBRARY = {
  'reverse:string': {
    signature: 'reverse:string',
    summary: 'Reverses a string character by character.',
    code: `
function oracle(s) {
  let out = '';
  for (let i = s.length - 1; i >= 0; i--) out += s[i];
  return out;
}`,
  },
  'sum:number[]': {
    signature: 'sum:number[]',
    summary: 'Sums every element of a numeric array.',
    code: `
function oracle(nums) {
  let total = 0;
  for (let i = 0; i < nums.length; i++) total += nums[i];
  return total;
}`,
  },
  'isPalindrome:string': {
    signature: 'isPalindrome:string',
    summary: 'Compares characters from both ends towards the middle.',
    code: `
function oracle(s) {
  let i = 0, j = s.length - 1;
  while (i < j) {
    if (s[i] !== s[j]) return false;
    i++; j--;
  }
  return true;
}`,
  },
  'max:number[]': {
    signature: 'max:number[]',
    summary: 'Largest element, using a linear scan with no initial value.',
    code: `
function oracle(nums) {
  let best = nums[0];
  for (let i = 1; i < nums.length; i++) if (nums[i] > best) best = nums[i];
  return best;
}`,
  },
  'secondLargest:number[]': {
    signature: 'secondLargest:number[]',
    summary: 'Second largest distinct element.',
    code: `
function oracle(nums) {
  let first = -Infinity, second = -Infinity;
  for (let i = 0; i < nums.length; i++) {
    const v = nums[i];
    if (v > first) { second = first; first = v; }
    else if (v < first && v > second) { second = v; }
  }
  return second === -Infinity ? null : second;
}`,
  },
  'fib:number': {
    signature: 'fib:number',
    summary: 'Naive recursive Fibonacci, correct by construction.',
    code: `
function oracle(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  return oracle(n - 1) + oracle(n - 2);
}`,
  },
  'isPrime:number': {
    signature: 'isPrime:number',
    summary: 'Trial division up to the square root.',
    code: `
function oracle(n) {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0) return false;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}`,
  },
  'gcd:number,number': {
    signature: 'gcd:number,number',
    summary: 'Euclidean algorithm.',
    code: `
function oracle(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}`,
  },
  'sorted:boolean': {
    signature: 'sorted:boolean',
    summary: 'Checks non-decreasing order by scanning adjacent pairs.',
    code: `
function oracle(nums) {
  for (let i = 1; i < nums.length; i++) if (nums[i] < nums[i - 1]) return false;
  return true;
}`,
  },
  'rotate:number[],number': {
    signature: 'rotate:number[],number',
    summary: 'Rotates an array right by k using concatenation.',
    code: `
function oracle(nums, k) {
  if (nums.length === 0) return [];
  let r = ((k % nums.length) + nums.length) % nums.length;
  return nums.slice(nums.length - r).concat(nums.slice(0, nums.length - r));
}`,
  },
  'countVowels:string': {
    signature: 'countVowels:string',
    summary: 'Counts a, e, i, o, u case-insensitively.',
    code: `
function oracle(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i].toLowerCase();
    if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') n++;
  }
  return n;
}`,
  },
  'binarySearch:number[],number': {
    signature: 'binarySearch:number[],number',
    summary: 'Linear scan returning the index of the target, or -1.',
    code: `
function oracle(nums, target) {
  for (let i = 0; i < nums.length; i++) if (nums[i] === target) return i;
  return -1;
}`,
  },
  'removeDuplicates:number[]': {
    signature: 'removeDuplicates:number[]',
    summary: 'Keeps the first occurrence of each value, preserving order.',
    code: `
function oracle(nums) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    if (!seen.has(nums[i])) { seen.add(nums[i]); out.push(nums[i]); }
  }
  return out;
}`,
  },
  'flatten:array': {
    signature: 'flatten:array',
    summary: 'Flattens arbitrarily nested arrays.',
    code: `
function oracle(arr) {
  const out = [];
  function walk(a) {
    for (let i = 0; i < a.length; i++) {
      if (Array.isArray(a[i])) walk(a[i]);
      else out.push(a[i]);
    }
  }
  walk(arr);
  return out;
}`,
  },
}

/** Heuristic signature guess, used to pick a library oracle automatically. */
export function guessSignature(functionName, params) {
  const name = (functionName || '').toLowerCase()
  const types = params.map((p) => p.type)

  const byName = [
    [/fib/, 'fib:number'],
    [/isprime|prime/, 'isPrime:number'],
    [/gcd|euclid/, 'gcd:number,number'],
    [/palindrome/, 'isPalindrome:string'],
    [/vowel/, 'countVowels:string'],
    [/secondlargest|secondmax/, 'secondLargest:number[]'],
    [/max|largest|peak/, 'max:number[]'],
    [/sum|total/, 'sum:number[]'],
    [/revers|rotate/, 'reverse'],
    [/dedup|distinct|unique/, 'removeDuplicates:number[]'],
    [/flatten|squash/, 'flatten:array'],
    [/sorted|isascending/, 'sorted:boolean'],
    [/binarysearch|search|indexof/, 'binarySearch:number[],number'],
  ]
  for (const [re, sig] of byName) {
    if (re.test(name)) {
      if (sig === 'reverse') {
        return types.includes('string') ? 'reverse:string' : 'rotate:number[],number'
      }
      return sig
    }
  }

  if (types.length === 1 && types[0] === 'string') return 'reverse:string'
  if (types.length === 1 && types[0] === 'array') return 'sum:number[]'
  if (types.length === 1 && types[0] === 'number') return 'isPrime:number'
  return undefined
}

export function getLibraryOracle(signature) {
  return ORACLE_LIBRARY[signature] ?? null
}

const ORACLE_CACHE = new Map()

/** Ask a free-tier model to write an independent, obviously-correct version. */
export async function synthesizeOracle({ functionName, params, spec, llm, signal }) {
  const prompt = [
    'You write REFERENCE implementations for differential testing.',
    '',
    `Task name: ${functionName}`,
    spec ? `Task specification: ${spec}` : 'Task specification: (not provided)',
    `Parameter types: ${params.map((p) => `${p.name}: ${p.type}`).join(', ')}`,
    '',
    'Rules:',
    `1. Name the function exactly "${functionName}".`,
    '2. Write the SIMPLEST implementation that is obviously correct -- brute force is preferred and encouraged.',
    '3. Do not be clever, do not optimise, do not use clever data structures.',
    '4. Assume nothing is validated; handle the empty and single-element cases naturally.',
    '5. Reply with only JavaScript code inside a single ```js code block. No explanation.',
  ].join('\n')

  const raw = await llm.complete(prompt, { maxTokens: 700, signal, temperature: 0 })
  const code = extractCodeBlock(raw)
  if (!code || !code.includes(functionName)) return null
  return {
    signature: `llm:${functionName}`,
    summary: 'Independent implementation generated for this run.',
    code: renameOracleEntry(code, functionName),
  }
}

function extractCodeBlock(text) {
  if (!text) return null
  const match = text.match(/```(?:js|javascript)?\s*([\s\S]*?)```/)
  if (match) return match[1].trim()
  // Model ignored the fence: accept the raw text if it parses as JS.
  return text.includes('function') ? text.trim() : null
}

/**
 * Validators: the security case.
 *
 * A validator does not compute an answer, it accepts or rejects. That breaks the
 * normal comparison, because there is no reference "error message for input q"
 * to disagree with -- what there is instead is the *policy*: the rule the
 * author intended to enforce.
 *
 * So this mode compares acceptance, not output. The subject's verdict is
 * normalised to a boolean and compared against the policy's:
 *
 *   subject accepts  (returns null / undefined / true / '')
 *   policy rejects                       -> an input got through that should not
 *   subject rejects  (returns an error message)
 *   policy accepts                       -> a legitimate input was refused
 *
 * The first is a bypass, which is the finding that matters.
 */
export function subjectAccepts(value) {
  return value === null || value === undefined || value === true || value === ''
}

/**
 * Named policies for the common shapes, so a demo is one click and every bound
 * is written by hand rather than guessed out of the subject's own source.
 */
export const POLICY_PRESETS = {
  'quantity': {
    label: 'Quantity: an integer from 1 to 100',
    min: 1,
    max: 100,
    integer: true,
  },
  'age': {
    label: 'Age: an integer from 0 to 120',
    min: 0,
    max: 120,
    integer: true,
  },
  'percentage': {
    label: 'Percentage: a number from 0 to 100',
    min: 0,
    max: 100,
    integer: false,
  },
  'port': {
    label: 'Port: an integer from 1 to 65535',
    min: 1,
    max: 65535,
    integer: true,
  },
}

/**
 * Build a range policy as a reference function.
 *
 * Deliberately strict in the ways hand-written validators usually are not: it
 * rejects `NaN`, both infinities, non-numbers and (when asked) fractions. That
 * strictness is the whole point -- `if (q <= 0) return 'must be positive'` does
 * not reject `NaN`, because every comparison with `NaN` is false.
 */
export function buildRangePolicy({ min, max, integer = true, range = true }, functionName) {
  const integerCheck = integer ? '\n  if (!Number.isInteger(q)) return false;' : ''
  // With `range: false` the policy enforces only what a hand-written guard is
  // almost certain to forget: type, finiteness, wholeness. That subset cannot
  // disagree with a correct validator about its own bounds, because it does not
  // state any.
  const rangeCheck = range
    ? `\n  if (q < ${min}) return false;\n  if (q > ${max}) return false;`
    : ''
  return `
function oracle(q) {
  if (typeof q !== 'number') return false;
  if (!Number.isFinite(q)) return false;${integerCheck}${rangeCheck}
  return true;
}`
}

/**
 * Decide whether a submitted function is a validator, and if so which policy to
 * hold it to.
 *
 * This runs *before* the generic signature guess, and the ordering is not
 * cosmetic. `guessSignature` falls back to "one numeric parameter -> isPrime",
 * which would cheerfully hand a quantity validator a primality oracle and then
 * compare two unrelated answers -- producing confident nonsense on exactly the
 * class of function where a security reviewer is relying on the tool.
 *
 * For a validator the interesting question was never what it returns. It is
 * which inputs it lets through.
 *
 * `requested` is an explicit preset id and is trusted outright. A name-based
 * guess additionally requires a single numeric parameter, so `max(xs)` and
 * `countVowels(s)` can never be mistaken for validators.
 */
export function resolvePolicy({ functionName, params, requested }) {
  const byRequest = requested ? POLICY_PRESETS[requested] : null
  if (byRequest) return policyOracle(byRequest, byRequest, functionName, params)

  const name = (functionName || '').toLowerCase()
  const singleNumber = params.length === 1 && params[0].type === 'number'
  if (!singleNumber) return null

  const byName = [
    [/age|years|yearsold/, 'age'],
    [/qty|quantity|stock|units/, 'quantity'],
    [/percent|pct|percentage/, 'percentage'],
    [/port/, 'port'],
  ]
  let preset = null
  for (const [re, id] of byName) {
    if (re.test(name)) { preset = id; break }
  }

  // A validating name over a single number is the other strong signal.
  if (!preset && /valid|check|verify|allow|accept|sanit|ensure|assert|within|range|between|limit/.test(name)) {
    preset = 'quantity'
  }
  if (!preset) return null

  return policyOracle(preset, POLICY_PRESETS[preset], functionName, params)
}

/**
 * Build the reference policy for a detected validator.
 *
 * The bounds come from the *subject's own* comparisons, not from the preset,
 * whenever the inferencer could recover them. That matters more than it looks:
 * it makes a false bypass structurally impossible on the range itself, because
 * the policy can only ever disagree with the range the author already wrote.
 * What survives is exactly the real bug class -- `NaN`, `Infinity`, a string or
 * a boolean walking straight through a check that only ever tested ordering.
 *
 * Guessing a range instead (say 1..100 for anything called `checkSomething`)
 * would flag a perfectly correct 0..5 score validator as broken, and a security
 * tool that cries wolf is worse than no tool.
 */
function policyOracle(id, spec, functionName, params = []) {
  const inferred = params[0] ?? {}
  const min = inferred.min
  const max = inferred.max

  // The inferencer reads `q < 1` as a loop bound (so q's minimum is 0), which is
  // the right reading for `for (i = 0; i < n; i++)` and the wrong one for
  // `if (q < 1) return 'bad'`. For a validator the two bounds come out
  // inverted -- 100..0 -- and a policy built from them rejects every input,
  // which would report a bypass on correct code.
  //
  // So the range is used only when it is internally coherent. Otherwise the
  // policy drops the range and enforces only type, finiteness and wholeness.
  // That still finds the real bug -- NaN, Infinity and a bare string walk
  // straight through an ordering check -- while being incapable of disputing a
  // correct validator about a bound the subject itself supplied.
  const useRange = typeof min === 'number' && typeof max === 'number' && min <= max

  // Wholeness is enforced only when the subject's own code checks it. Copying it
  // from the preset instead would fail a perfectly good 0.5..50 weight check
  // for accepting 0.5, and a 0..5 score check for accepting 2.5. Same principle
  // as the range: only hold a validator to a rule its own source states.
  //
  // Finiteness is the opposite case and is always enforced, whether or not the
  // subject checks it. That check *is* the bug: a validator that never rejects
  // NaN is exactly the finding we are looking for, so weakening the reference
  // when the subject is weak would hide it.
  const integer = inferred.checksInteger === true

  const rangeText = useRange
    ? `${min} to ${max}`
    : 'a number, with no range assumed'

  return {
    signature: `policy:${id}${useRange ? `:${min}..${max}` : ''}`,
    summary:
      `Accepts an input only if it matches the rule the author wrote: ${rangeText}. ` +
      'The reference is deliberately stricter than a hand-written guard, because it also rejects ' +
      'NaN, both infinities and non-numbers.',
    code: buildRangePolicy({ min, max, integer, range: useRange }),
    source: 'policy',
    mode: 'accept',
    // Tells the harness the range is unknown, so only provable bypasses count.
    strictOnly: !useRange,
  }
}

/**
 * Run the differential loop. Stops at the first disagreement so the shrinker
 * gets a concrete, reproducible seed.
 */
export function findFirstDisagreement(subjectCtx, oracleCtx, functionName, args, opts = {}) {
  const { perCallTimeoutMs = 50, detectNondeterminism = true, mode = 'value' } = opts

  const subject = callVerified(subjectCtx, functionName, args, perCallTimeoutMs)
  const oracle = callVerified(oracleCtx, functionName, args, perCallTimeoutMs)

  if (subject.status === 'timeout') {
    return { kind: 'timeout', message: subject.error, args }
  }
  if (subject.status === 'unstable' || oracle.status === 'unstable') {
    return { kind: 'skip', reason: 'unstable' }
  }
  if (oracle.status === 'timeout') {
    // Oracle is too slow for this input; skip rather than report a false bug.
    return { kind: 'skip', reason: 'oracle-timeout' }
  }
  if (oracle.status === 'threw') {
    return { kind: 'skip', reason: 'oracle-threw' }
  }
  if (subject.status === 'threw') {
    return { kind: 'threw', message: subject.error, args, oracleValue: oracle.value }
  }

  if (mode === 'accept') {
    const subjectVerdict = subjectAccepts(subject.value)
    const policyVerdict = oracle.value === true
    if (subjectVerdict !== policyVerdict) {
      const verdict = subjectVerdict && !policyVerdict ? 'bypass' : 'false-rejection'

      // Asymmetric on purpose.
      //
      // A *bypass* is provable from strictness alone: if the subject let NaN
      // through a check that only ever tested ordering, that is a bypass no
      // matter what range the author had in mind.
      //
      // A *false rejection* is the other way round. Without a trustworthy range
      // the policy accepts every well-formed number, so a subject correctly
      // rejecting -1 would be reported as wrongly refusing valid input. That is
      // a defect in the reference, not in the subject, so it is not evidence and
      // is never reported.
      if (verdict === 'false-rejection' && opts.policyStrictOnly) {
        return { kind: 'skip', reason: 'range-unknown' }
      }

      return {
        kind: 'wrong-answer',
        args,
        expected: policyVerdict,
        actual: subjectVerdict,
        subjectValue: subject.value,
        verdict,
      }
    }
  } else if (!deepEqual(subject.value, oracle.value)) {
    return {
      kind: 'wrong-answer',
      args,
      expected: oracle.value,
      actual: subject.value,
    }
  }

  if (detectNondeterminism) {
    const again = callVerified(subjectCtx, functionName, args, perCallTimeoutMs)
    if (again.status === 'ok' && !deepEqual(subject.value, again.value)) {
      return {
        kind: 'nondeterministic',
        args,
        expected: oracle.value,
        actual: subject.value,
        second: again.value,
      }
    }
  }

  return { kind: 'agree' }
}

/**
 * Invoke a function, treating an unstable result as unproven.
 *
 * `vm.Script`'s timeout is wall-clock, not CPU time. The shrinker runs hundreds
 * of thousands of calls in a tight loop, so under load a garbage-collection
 * pause or a scheduling hiccup can blow a 40ms budget on a four-element sum.
 * Reporting that as "does not terminate" produces a false positive on a
 * perfectly correct function -- and because the shrinker then minimises toward
 * it, the resulting counterexample looks completely plausible. It is the worst
 * kind of bug in a bug-finder: confidently wrong.
 *
 * A genuine infinite loop fails again under a larger budget; a scheduling
 * artefact does not. The same applies to an exception: a `RangeError` from
 * memory pressure under load is not a defect in the submitted function.
 *
 * So: retry with a larger budget, and only trust a failure that reproduces.
 */
export function callVerified(context, functionName, args, perCallTimeoutMs) {
  const first = callFn(context, functionName, args, perCallTimeoutMs)
  if (first.status === 'ok') return first

  const retry = callFn(context, functionName, args, perCallTimeoutMs * TIMEOUT_RETRY_FACTOR)

  if (retry.status === 'ok') return retry
  // Two identical failures are evidence, not noise: a loop that will not
  // terminate under 4x the budget was not going to terminate under 1x.
  if (first.status === 'timeout' && retry.status === 'timeout') return first
  if (first.status === 'threw' && retry.status === 'threw') return first
  // Anything else means the two attempts disagreed, so the result depends on
  // machine load rather than on the code. Report nothing.
  return { status: 'unstable', error: 'inconclusive: result differed between attempts' }
}

const TIMEOUT_RETRY_FACTOR = 4

/**
 * Rename the oracle's entry point to match the subject, then compile it.
 * The library oracles are all written as `oracle(...)` so that a single
 * implementation can be reused across problems; the differential harness
 * needs both sides to expose the same symbol.
 */
export function renameOracleEntry(code, functionName) {
  if (!code || !functionName) return code
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return code
    .replace(new RegExp(`\\boracle\\b(?=\\s*\\()`, 'g'), functionName)
    .replace(new RegExp(`\\boracle\\b(?=\\s*[:=])`, 'g'), functionName)
    .replace(new RegExp(`function\\s+oracle\\b`, 'g'), `function ${escaped}`)
    .replace(new RegExp(`const\\s+oracle\\b`, 'g'), `const ${escaped}`)
    .replace(new RegExp(`let\\s+oracle\\b`, 'g'), `let ${escaped}`)
}

/** Compile an oracle source, returning null if it is unusable. */
export function compileOracle(code, functionName) {
  try {
    return compile(renameOracleEntry(code, functionName), functionName)
  } catch {
    return null
  }
}

export { isTimeout }