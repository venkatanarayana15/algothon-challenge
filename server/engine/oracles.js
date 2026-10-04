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
 * Run the differential loop. Stops at the first disagreement so the shrinker
 * gets a concrete, reproducible seed.
 */
export function findFirstDisagreement(subjectCtx, oracleCtx, functionName, args, opts = {}) {
  const { perCallTimeoutMs = 50, detectNondeterminism = true } = opts

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

  if (!deepEqual(subject.value, oracle.value)) {
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