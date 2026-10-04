/**
 * Sandbox: run untrusted JavaScript with a hard wall-clock budget.
 *
 * `node:vm` is not a security boundary on its own -- a determined attacker can
 * escape it through prototype chains. We are not defending against a nation
 * state here; we are defending against a tired competitor pasting a `while(true)`
 * at 9:55 PM. So: fresh context per run, no host globals reachable, frozen
 * intrinsics, and a per-call timeout enforced by the caller.
 */

import vm from 'node:vm'

/** Create an isolated context with a minimal, frozen global surface. */
export function createContext({ captureConsole = true } = {}) {
  const logs = []
  const sandbox = Object.create(null)

  if (captureConsole) {
    sandbox.console = Object.freeze({
      log: (...args) => logs.push(args.map(safeString).join(' ')),
      warn: (...args) => logs.push(args.map(safeString).join(' ')),
      error: (...args) => logs.push(args.map(safeString).join(' ')),
      info: (...args) => logs.push(args.map(safeString).join(' ')),
    })
  }

  // Deliberately NOT exposed: require, process, global, Buffer, fetch,
  // setTimeout, WebAssembly, Function (via the sandbox's own copy).
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  })

  // Freeze the intrinsics the user can reach, so a `while(true)` cannot be
  // escaped into by mutating Array.prototype.
  vm.runInContext(`
    (function harden(){
      try {
        [Object, Array, String, Number, Boolean, RegExp, Date, Math, JSON, Promise]
          .forEach(function(o){ Object.freeze(o); });
        [Object.prototype, Array.prototype, String.prototype, Number.prototype,
         Function.prototype, Boolean.prototype, RegExp.prototype]
          .forEach(function(o){ Object.freeze(o); });
      } catch (e) {}
    })();
  `, context, { timeout: 1000 })

  return { context, logs }
}

/**
 * Compile source in a fresh context and return the named function.
 * Throws on syntax errors so the caller can surface a useful message.
 */
export function compile(code, functionName, options = {}) {
  const { context, logs } = createContext(options)
  try {
    new vm.Script(code, { filename: 'submission.js' }).runInContext(context, { timeout: options.compileTimeoutMs ?? 2000 })
  } catch (err) {
    throw new Error(`Runtime error while loading your code: ${describe(err)}`)
  }

  let fn
  try {
    fn = vm.runInContext(`typeof ${functionName}`, context, { timeout: 500 })
  } catch {
    fn = 'undefined'
  }
  if (fn !== 'function') {
    throw new Error(`"${functionName}" is not a function in the submitted source.`)
  }
  return { context, logs }
}

/**
 * Serialize an argument tuple into JavaScript source.
 *
 * `JSON.stringify` is not usable here: it silently turns NaN, Infinity and
 * -Infinity into `null`, and replaces undefined with null inside arrays. That
 * quietly changes the program under test -- an early version reported
 * `binarySearch([-Infinity], null)` as a counterexample when the real finding
 * was the mangle, not a bug.
 */
export function toLiteral(value, depth = 0) {
  if (depth > 10) return 'null'
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'

  const t = typeof value
  if (t === 'number') {
    if (Number.isNaN(value)) return 'NaN'
    if (value === Infinity) return 'Infinity'
    if (value === -Infinity) return '-Infinity'
    if (Object.is(value, -0)) return '-0'
    return String(value)
  }
  if (t === 'boolean') return String(value)
  if (t === 'string') return JSON.stringify(value)
  if (t === 'bigint') return `${value}n`
  if (t === 'function' || t === 'symbol') return 'undefined'

  if (Array.isArray(value)) {
    return `[${value.map((v) => toLiteral(v, depth + 1)).join(',')}]`
  }

  if (t === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined)
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${toLiteral(v, depth + 1)}`).join(',')}}`
  }

  return 'null'
}

/** Invoke a compiled function with a timeout. Returns a discriminated result. */
export function callFn(context, functionName, args, timeoutMs = 50) {
  const argLiteral = toLiteral(args)
  const script = new vm.Script(`__RESULT = ${functionName}.apply(null, ${argLiteral})`)
  try {
    script.runInContext(context, { timeout: timeoutMs, breakOnSigint: true })
  } catch (err) {
    if (isTimeout(err)) {
      return { status: 'timeout', error: `Exceeded ${timeoutMs}ms -- possible infinite loop or excessive complexity` }
    }
    return { status: 'threw', error: describe(err) }
  }
  let value
  try {
    value = vm.runInContext('__RESULT', context, { timeout: timeoutMs })
  } catch (err) {
    return { status: 'threw', error: describe(err) }
  }
  return { status: 'ok', value }
}

export function isTimeout(err) {
  if (!err) return false
  const code = err.code
  return code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || code === 'ERR_SCRIPT_EXECUTION_INTERRUPTED'
    || /Script execution timed out/i.test(err.message ?? '')
}

/** Turn a thrown value into a short human-readable string. */
export function describe(err) {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

/**
 * Stable serialization for output comparison. Two functions that return
 * structurally equal results must compare equal regardless of key order.
 */
export function serialize(value, depth = 0) {
  if (depth > 12) return '"<deep>"'
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'number') {
    if (Number.isNaN(value)) return 'NaN'
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity'
    if (Object.is(value, -0)) return '-0'
    return String(value)
  }
  if (t === 'boolean' || t === 'string') return JSON.stringify(value)
  if (t === 'bigint') return `${value}n`
  if (t === 'function') return '"<function>"'
  if (t === 'symbol') return '"<symbol>"'
  if (Array.isArray(value)) {
    return `[${value.slice(0, 200).map((v) => serialize(v, depth + 1)).join(',')}]`
  }
  if (value instanceof Map) return `Map(${value.size})`
  if (value instanceof Set) return `Set(${value.size})`
  if (t === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(value[k], depth + 1)}`).join(',')}}`
  }
  return '"<unknown>"'
}

export function deepEqual(a, b) {
  return serialize(a) === serialize(b)
}

/** Render an argument tuple as a readable call, e.g. `twoSum([1,2], 3)`. */
export function formatCall(functionName, args) {
  const rendered = args.map((arg) => formatValue(arg, 0))
  return `${functionName}(${rendered.join(', ')})`
}

function formatValue(value, depth) {
  if (depth > 4) return '…'
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  const t = typeof value
  if (t === 'number') {
    if (Number.isNaN(value)) return 'NaN'
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity'
    return String(value)
  }
  if (t === 'string') return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value)
  if (t === 'boolean' || t === 'bigint') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.length > 12) return `[${value.slice(0, 6).map((v) => formatValue(v, depth + 1)).join(', ')}, … ${value.length} items]`
    return `[${value.map((v) => formatValue(v, depth + 1)).join(', ')}]`
  }
  if (t === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    return `{ ${keys.slice(0, 6).map((k) => `${k}: ${formatValue(value[k], depth + 1)}`).join(', ')} }`
  }
  return String(value)
}

/** Measure the "size" of a value -- the shrinker's cost function lives with it. */