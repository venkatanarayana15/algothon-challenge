/**
 * Input generation.
 *
 * Random fuzzing finds crashes. It does not find logic bugs, because the
 * probability of stumbling onto the one interesting input out of 10^6 is
 * effectively zero. So every generator here is *biased*: it enumerates the
 * boundary values that a human would think to test but never did -- 0, 1, n-1,
 * empty, single-element, all-equal, reversed, duplicated, extreme.
 */

const NUMERIC_EDGES = [
  0, 1, -1, 2, -2, 3, 4, 5, 10,
  Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER,
  2 ** 31 - 1, -(2 ** 31), 2 ** 31,
  Number.MAX_SAFE_INTEGER - 1, Number.EPSILON,
  NaN, Infinity, -Infinity, 0.5, -0.5,
]

const STRING_EDGES = [
  '', ' ', 'a', 'ab', 'abc', 'hello', 'world',
  'aaa', 'aaaa', 'ABC', 'AbC',
  'a b', '  padded  ', 'tab\there', 'new\nline',
  '\\backslash', 'quote"', "apos'", '<script>',
  '😀', 'éèê', 'null', 'undefined', 'NaN', '0',
]

const ARRAY_LENGTHS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 16, 32, 64]

/** Deterministic PRNG so a run can be reproduced from a seed. */
export function makeRandom(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 0x100000000
  }
}

function pick(rnd, list) {
  return list[Math.floor(rnd() * list.length) % list.length]
}

function inBounds(schema, value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return true
  if (schema.min !== undefined && Number.isFinite(schema.min) && value < schema.min) return false
  if (schema.max !== undefined && Number.isFinite(schema.max) && value > schema.max) return false
  return true
}

/**
 * Generate one value matching an inferred schema.
 * Deliberately over-generates: violating an inferred constraint is itself a
 * bug worth reporting, so some values escape `inBounds` on purpose.
 */
export function generateValue(schema, rnd, { respectBounds = true } = {}) {
  const type = schema?.type ?? 'unknown'

  switch (type) {
    case 'number': {
      const candidates = [...NUMERIC_EDGES]
      if (schema.min !== undefined && Number.isFinite(schema.min)) {
        candidates.push(schema.min, schema.min + 1, schema.min - 1)
      }
      if (schema.max !== undefined && Number.isFinite(schema.max)) {
        candidates.push(schema.max, schema.max - 1, schema.max + 1)
      }
      if (schema.derivedFrom && schema.derivedFrom.length > 0) {
        candidates.push(schema.derivedFrom)
      }
      if (schema.derivedLengthMinusOne) candidates.push(1, 0)
      candidates.push(Math.floor(rnd() * 21) - 5, Math.floor(rnd() * 100))
      const v = pick(rnd, candidates)
      return respectBounds && !inBounds(schema, v) ? pick(rnd, NUMERIC_EDGES) : v
    }

    case 'boolean':
      return rnd() < 0.5

    case 'string': {
      if (schema.lowerBound !== undefined && schema.lowerBound > 1) {
        const s = pick(rnd, STRING_EDGES)
        return s.length >= schema.lowerBound ? s : s.padEnd(schema.lowerBound, 'x')
      }
      return pick(rnd, STRING_EDGES)
    }

    case 'array': {
      const length = schema.lengthConstraint ?? pick(rnd, ARRAY_LENGTHS)
      const n = Math.max(0, Math.min(length, 512))
      const out = []
      const elementSchema = schema.element ?? { type: 'number' }
      // A few high-value shapes, then random fill.
      const shape = rnd()
      if (shape < 0.08) {
        // all equal -- breaks "find the unique" / "second largest" logic
        const v = generateValue(elementSchema, rnd)
        for (let i = 0; i < n; i++) out.push(v)
      } else if (shape < 0.16) {
        // sorted, and reverse sorted -- breaks two-pointer / binary search logic
        for (let i = 0; i < n; i++) out.push(generateValue(elementSchema, rnd))
        out.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
        if (rnd() < 0.5) out.reverse()
      } else if (shape < 0.22) {
        // all identical-but-boring run of zeros
        for (let i = 0; i < n; i++) out.push(elementSchema.type === 'string' ? '' : 0)
      } else {
        for (let i = 0; i < n; i++) out.push(generateValue(elementSchema, rnd))
      }
      if (schema.unique) {
        const seen = new Set()
        return out.filter((v) => {
          const k = JSON.stringify(v)
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
      }
      return out
    }

    case 'sequence': {
      // The analyser could not tell an array from a string, so try both.
      // Which one we pick changes which bugs we can find, so this is not a
      // cosmetic detail: guessing wrong means testing the wrong domain.
      const asArray = generateValue({ type: 'array', element: schema.element ?? { type: 'number' } }, rnd)
      const asString = generateValue({ type: 'string' }, rnd)
      return rnd() < 0.5 ? asArray : asString
    }

    case 'object': {
      const keys = schema.keys ?? ['key']
      const out = {}
      for (const k of keys) out[k] = generateValue(schema.value ?? { type: 'number' }, rnd)
      return out
    }

    default:
      return pick(rnd, [0, 1, -1, '', [], {}, null, true])
  }
}

/**
 * Build one full argument tuple. Cross-parameter constraints learned from the
 * source (e.g. "the array's length is the other parameter") are applied here,
 * which is what makes inputs *coherent* rather than independently random.
 */
export function generateArgs(paramSchemas, rnd, options = {}) {
  const args = paramSchemas.map((schema) => generateValue(schema, rnd, options))

  for (const link of options.lengthLinks ?? []) {
    const { arrayIndex, lengthIndex } = link
    const len = args[lengthIndex]
    if (typeof len === 'number' && Number.isFinite(len) && Array.isArray(args[arrayIndex])) {
      const n = Math.max(0, Math.min(Math.trunc(len), 512))
      const elementSchema = paramSchemas[arrayIndex]?.element ?? { type: 'number' }
      const resized = []
      for (let i = 0; i < n; i++) {
        resized.push(args[arrayIndex][i] ?? generateValue(elementSchema, rnd))
      }
      args[arrayIndex] = resized
    }
  }

  return args
}

/** Run `fn` over `count` generated tuples, stopping early via `shouldStop`. */
export function* generateInputs(paramSchemas, count, seed, options = {}) {
  const rnd = makeRandom(seed)
  for (let i = 0; i < count; i++) {
    yield generateArgs(paramSchemas, rnd, options)
  }
}