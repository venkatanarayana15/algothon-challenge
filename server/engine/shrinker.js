/**
 * Shrinker: turn a failing input into the smallest one that still fails.
 *
 * `f([7,3,9,1,4,2,8,6,5], 4)` is a bug report nobody can act on.
 * `f([0], 0)` is a bug that gets fixed in four minutes. This is the whole
 * product.
 *
 * Three deterministic passes:
 *   1. ddmin -- remove chunks of array elements (Zeller's delta debugging).
 *      O(n log n) rather than the 2^n of "try every subset", which matters:
 *      a 32-element array has 4 billion subsets and we have milliseconds.
 *   2. value simplification -- walk a ladder from exotic to plain
 *      (Infinity -> large -> small integer) and keep the plainest value that
 *      still reproduces. This is what turns `fib(NaN)` into `fib(1)`.
 *   3. string shortening -- prefix truncation, then truncation to the first
 *      character.
 *
 * Arity is always preserved. Reporting `indexOfTarget(1)` for a two-argument
 * function is technically a smaller input and practically a confusing one, so
 * dropped arguments become neutral placeholders instead of disappearing.
 */

import { formatCall } from './sandbox.js'

/** The neutral value used when an argument turns out to be unused. */
export function placeholderFor(schema) {
  switch (schema?.type) {
    case 'string': return ''
    case 'array': return []
    case 'sequence': return []
    case 'boolean': return false
    case 'object': return {}
    default: return 0
  }
}

function measureValue(value) {
  if (value === null || value === undefined) return 1
  if (typeof value === 'number') return 1
  if (typeof value === 'string') return value.length + 1
  if (typeof value === 'boolean') return 1
  if (Array.isArray(value)) return 1 + value.reduce((s, v) => s + measureValue(v), 0)
  if (typeof value === 'object') return 1 + Object.values(value).reduce((s, v) => s + measureValue(v), 0)
  return 1
}

export function totalMeasure(args) {
  return args.reduce((sum, a) => sum + measureValue(a), 0)
}

/**
 * Pass 1: ddmin over one array-valued argument.
 * Granularity doubles each round; any chunk removal that still reproduces is
 * kept and the process restarts at a finer granularity.
 */
function ddminArray(reproduces, args, index, deadline) {
  let arr = [...args[index]]

  let granularity = 2
  while (arr.length >= 2 && Date.now() < deadline) {
    const chunkSize = Math.max(1, Math.floor(arr.length / granularity))
    let reduced = false

    for (let start = 0; start < arr.length; start += chunkSize) {
      if (Date.now() > deadline) break
      const end = start + chunkSize
      const complement = [...arr.slice(0, start), ...arr.slice(end)]
      if (complement.length === arr.length) continue

      const attempt = [...args]
      attempt[index] = complement
      if (reproduces(attempt)) {
        arr = complement
        reduced = true
        // Restart at a finer granularity for the new, smaller array.
        granularity = Math.max(2, granularity - 1)
        break
      }
    }

    if (!reduced) {
      if (chunkSize === 1) break
      granularity = Math.min(arr.length * 2, granularity * 2)
    }
  }

  return arr
}

/**
 * Value ladder, ordered most exotic to plainest.
 */
function simplifyLadder(value) {
  if (typeof value !== 'number') return []
  if (!Number.isFinite(value)) return [0, 1, -1]
  if (!Number.isInteger(value)) return dedupe([Math.trunc(value), Math.round(value), 0, 1, -1], value)

  const magnitude = Math.abs(value)
  if (magnitude > 1) {
    const ladder = []
    if (magnitude > 1_000_000) ladder.push(Math.trunc(value / 2))
    ladder.push(value - Math.sign(value))
    ladder.push(0, 1, -1)
    return dedupe(ladder, value)
  }
  return value === 0 ? [1, -1] : value === 1 ? [0, -1] : [0, 1]
}

/**
 * Walk a ladder and return the *plainest* value that still reproduces.
 *
 * Taking the first hit would settle for any halving that happens to work:
 * `gcd(-1, 33554431)` is a perfectly valid counterexample and a terrible thing
 * to show a judge. Testing the whole ladder and keeping the last success
 * converges on `gcd(-1, 0)` instead.
 */
function pickPlainest(reproduces, args, index, ladder) {
  let best = args[index]
  for (const candidate of ladder) {
    const attempt = [...args]
    attempt[index] = candidate
    if (reproduces(attempt)) best = candidate
  }
  return best
}

function simplifyString(value) {
  if (value.length === 0) return []
  if (value.length === 1) return value === ' ' ? [] : ['']
  // Ordered exotic -> plain: keep the first character, then the empty string.
  return dedupe([value[0], ''], value)
}

function dedupe(list, exclude) {
  return list.filter((v, i) => v !== exclude && list.indexOf(v) === i)
}

/** One greedy simplification sweep over a single argument slot. */
function simplifySlot(reproduces, args, index, deadline, schemas) {
  const current = args[index]

  if (typeof current === 'number') {
    return pickPlainest(reproduces, args, index, simplifyLadder(current))
  }

  if (typeof current === 'string') {
    return pickPlainest(reproduces, args, index, simplifyString(current))
  }

  if (Array.isArray(current)) {
    let arr = ddminArray(reproduces, args, index, deadline)
    // Then simplify each surviving element in place.
    for (let i = 0; i < arr.length; i++) {
      if (Date.now() > deadline) break
      const nested = [...args]
      nested[index] = arr
      arr[i] = simplifyValue(reproduces, nested, index, i, schemas?.[index]?.element, deadline)
    }
    return arr
  }

  return current
}

/** Simplify `arr[i]` while keeping the rest of the tuple fixed. */
function simplifyValue(reproduces, args, arrayIndex, elementIndex, schema, deadline) {
  const arr = args[arrayIndex]
  const withElement = (candidate) => {
    const next = [...arr]
    next[elementIndex] = candidate
    const attempt = [...args]
    attempt[arrayIndex] = next
    return attempt
  }

  if (typeof arr[elementIndex] === 'number') {
    let best = arr[elementIndex]
    for (const candidate of simplifyLadder(best)) {
      if (Date.now() > deadline) break
      if (reproduces(withElement(candidate))) best = candidate
    }
    return best
  }

  if (typeof arr[elementIndex] === 'string') {
    let best = arr[elementIndex]
    for (const candidate of simplifyString(best)) {
      if (Date.now() > deadline) break
      if (reproduces(withElement(candidate))) best = candidate
    }
    return best
  }

  // Nested array: recurse one level so flattening bugs can surface.
  if (Array.isArray(arr[elementIndex]) && measureValue(arr[elementIndex]) > 1) {
    let nested = ddminNested(reproduces, args, arrayIndex, elementIndex, deadline)
    for (let i = 0; i < nested.length; i++) {
      if (Date.now() > deadline) break
      nested[i] = simplifyValue(reproduces, args, arrayIndex, elementIndex, schema, deadline) ?? nested[i]
    }
    return nested
  }

  return arr[elementIndex]
}

function ddminNested(reproduces, args, arrayIndex, elementIndex, deadline) {
  const arr = args[arrayIndex]
  const inner = arr[elementIndex]
  let current = [...inner]

  for (let start = current.length - 1; start >= 0; start--) {
    if (Date.now() > deadline) break
    const next = current.slice(0, start).concat(current.slice(start + 1))
    const attempt = [...args]
    const nextArr = [...arr]
    nextArr[elementIndex] = next
    attempt[arrayIndex] = nextArr
    if (reproduces(attempt)) current = next
  }
  return current
}

/**
 * Full minimisation. `reproduces(args) -> boolean`.
 * `schemas` (optional) is the inferred parameter list, used to choose neutral
 * placeholders for unused arguments.
 */
export function minimize(reproduces, args, { maxRounds = 6, deadline = Date.now() + 4000, schemas } = {}) {
  let current = [...args]

  // Pass 0 -- replace unused arguments with neutral placeholders, and
  // normalise values whose type disagrees with the inferred schema. We keep
  // the arity so the reported call still matches the function signature.
  for (let round = 0; round < 2; round++) {
    if (Date.now() > deadline) break
    let changed = false
    for (let i = 0; i < current.length; i++) {
      const neutral = neutralFor(current[i], schemas?.[i])
      if (neutral === NO_CHANGE) continue
      const attempt = [...current]
      attempt[i] = neutral
      if (reproduces(attempt)) {
        current = attempt
        changed = true
      }
    }
    if (!changed) break
  }

  // Pass 1 + 2 -- simplify containers, then values, repeated to a fixed point.
  for (let round = 0; round < maxRounds; round++) {
    if (Date.now() > deadline) break
    const before = totalMeasure(current)
    let improved = false

    for (let i = 0; i < current.length; i++) {
      if (Date.now() > deadline) break
      const simplified = simplifySlot(reproduces, current, i, deadline, schemas)
      if (simplified !== current[i]) {
        current[i] = simplified
        improved = true
      }
    }

    // Strictly-smaller variants of scalar slots, e.g. n -> n-1, so the search
    // can walk down a range rather than jumping straight to 0 or 1.
    for (let i = 0; i < current.length; i++) {
      if (Date.now() > deadline) break
      const value = current[i]
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const target = Math.abs(value) > 1 ? value - Math.sign(value) : 0
      if (target === value) continue
      const attempt = [...current]
      attempt[i] = target
      if (totalMeasure(attempt) < before && reproduces(attempt)) {
        current = attempt
        improved = true
      }
    }

    if (!improved) break
  }

  return current
}

/**
 * Legacy tuple-oriented minimisation, kept for callers that want a
 * coarse-grained pass with a separate budget.
 */
export function minimizeTuple(reproduces, args, { deadline = Date.now() + 3000, schemas } = {}) {
  return minimize(reproduces, args, { deadline, maxRounds: 4, schemas })
}

const NO_CHANGE = Symbol('no-change')

/**
 * The value worth trying for a slot: the schema's neutral placeholder when the
 * argument is unused or has the wrong shape, otherwise "leave it alone".
 *
 * `binarySearch([-Infinity], null)` reproduces the bug just as well as
 * `binarySearch([-1], 0)`, but only one of them reads like something a human
 * would have thought to write -- and that is the whole deliverable.
 */
function neutralFor(value, schema) {
  const expected = schema?.type
  if (!expected || expected === 'unknown') {
    // No type evidence: still prefer a plain scalar over null/undefined.
    if (value === null || value === undefined) return 0
    return NO_CHANGE
  }

  const matches =
    (expected === 'number' && typeof value === 'number' && !Number.isNaN(value))
    || (expected === 'string' && typeof value === 'string')
    || (expected === 'boolean' && typeof value === 'boolean')
    || ((expected === 'array' || expected === 'sequence') && Array.isArray(value))
    || (expected === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value))

  if (matches) return NO_CHANGE
  return placeholderFor(schema)
}

/** Render the shrink result for the UI. */
export function describeMinimal(functionName, args) {
  return {
    call: formatCall(functionName, args),
    args,
    size: totalMeasure(args),
  }
}

export { measureValue }