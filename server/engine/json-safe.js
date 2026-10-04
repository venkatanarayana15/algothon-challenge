/**
 * Make a report survive JSON transport without losing values.
 *
 * `JSON.stringify` cannot represent three of JavaScript's own numbers.
 * `Infinity`, `-Infinity` and `NaN` all serialize to `null`, silently and with
 * no error. The engine reaches those values constantly -- `-Infinity` is the
 * standard "no value yet" sentinel, and it leaks out of a real function
 * precisely when that function is broken. So a report could claim a function
 * returned `null` when it actually returned `-Infinity`.
 *
 * That is not cosmetic. `secondLargest([Infinity, Infinity])` was shipping to
 * the gallery as "returned null / correct answer null": a counterexample that
 * does not look like one, on a headline demo card. `sandbox.js` already guards
 * the same hazard for the generated call string; this guards the values.
 *
 * Non-finite numbers are replaced with a tagged object that a real return
 * value cannot be mistaken for, and `formatValue` on the client renders it
 * back to `Infinity` / `-Infinity` / `NaN`. Every other value is copied
 * through untouched.
 */

/** The only key a sentinel object ever carries. */
export const NONFINITE_KEY = '$nonfinite'

const NONFINITE_TAGS = new Set(['NaN', 'Infinity', '-Infinity'])

/** True for a plain data object, i.e. one safe to walk key by key. */
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Deep-copy `value`, replacing non-finite numbers with tagged sentinels.
 * Returns the input unchanged when there is nothing to replace, so the common
 * case allocates nothing.
 */
export function toJsonSafe(value, depth = 0) {
  // Reports are shallow data. The cap is a backstop against a pathological
  // value, not a shape the engine is expected to produce.
  if (depth > 12) return null

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { [NONFINITE_KEY]: 'NaN' }
    if (value === Infinity) return { [NONFINITE_KEY]: 'Infinity' }
    if (value === -Infinity) return { [NONFINITE_KEY]: '-Infinity' }
    return value
  }

  // Primitives and anything exotic (Date, Map, function, bigint) pass through.
  if (!Array.isArray(value) && !isPlainObject(value)) return value

  let changed = false
  const out = Array.isArray(value) ? new Array(value.length) : {}

  for (const [key, item] of Object.entries(value)) {
    const encoded = toJsonSafe(item, depth + 1)
    if (encoded !== item) changed = true
    out[key] = encoded
  }

  return changed ? out : value
}