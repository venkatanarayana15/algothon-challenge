/**
 * Static analysis: read the user's source with acorn and infer what each
 * parameter of the target function *actually is*.
 *
 * This is the step that separates us from a random fuzzer. If we know that
 * `arr` is an array of numbers and `n` is a count bounded above by `arr.length`,
 * we can generate the boundary values a human would forget. If we know nothing,
 * we are just guessing.
 */

import { parse } from 'acorn'
import * as walk from 'acorn-walk'

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export class AnalysisError extends Error {}

/** Walk the AST, calling `visit` for every node. */
function eachNode(ast, visit) {
  const stack = [ast]
  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node.type !== 'string') continue
    visit(node)
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
      const value = node[key]
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') stack.push(child)
      } else if (value && typeof value.type === 'string') {
        stack.push(value)
      }
    }
  }
}

function parseSource(code) {
  try {
    return parse(code, {
      ecmaVersion: 2023,
      sourceType: 'script',
      allowReturnOutsideFunction: true,
      locations: false,
    })
  } catch {
    try {
      return parse(code, { ecmaVersion: 2023, sourceType: 'module', allowReturnOutsideFunction: true })
    } catch (err) {
      throw new AnalysisError(`Could not parse the source: ${err.message}`)
    }
  }
}

/** Find every top-level (or nested) function declaration / const arrow. */
export function findFunctions(code) {
  const ast = parseSource(code)
  const found = new Map()

  const record = (name, node) => {
    if (!name || !IDENT_RE.test(name)) return
    if (!found.has(name)) found.set(name, node)
  }

  walk.full(ast, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id) {
      record(node.id.name, { kind: 'declaration', node, name: node.id.name })
    }
    if (node.type === 'VariableDeclarator' && node.init) {
      const init = node.init
      if ((init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') && node.id.type === 'Identifier') {
        record(node.id.name, { kind: 'expression', node: init, name: node.id.name })
      }
    }
  })

  // Also accept a bare `function (…) {}` expression as an anonymous entry point.
  return [...found.values()]
}

/** Choose which function to fuzz: explicit name if given, else the only one. */
export function resolveTarget(code, requestedName) {
  const functions = findFunctions(code)
  if (functions.length === 0) throw new AnalysisError('No function found in the source.')

  if (requestedName) {
    const hit = functions.find((f) => f.name === requestedName)
    if (!hit) {
      throw new AnalysisError(
        `No function named "${requestedName}". Available: ${functions.map((f) => f.name).join(', ')}`,
      )
    }
    return hit
  }

  // Prefer the last declared top-level function as the likely entry point.
  const topLevel = functions.filter((f) => f.node.type === 'FunctionDeclaration')
  const pool = topLevel.length ? topLevel : functions
  if (pool.length > 1) {
    throw new AnalysisError(
      `Found ${pool.length} functions (${pool.map((f) => f.name).join(', ')}). ` +
      'Tell us which one to attack by passing a "functionName".',
    )
  }
  return pool[0]
}

function isParam(node, paramNames) {
  return node && node.type === 'Identifier' && paramNames.has(node.name)
}

function paramIndexOf(node, paramNames) {
  return node && node.type === 'Identifier' ? paramNames.get(node.name) : undefined
}

const ARRAY_METHODS = new Set([
  'push', 'pop', 'map', 'filter', 'reduce', 'forEach', 'slice', 'splice', 'indexOf',
  'includes', 'join', 'sort', 'reverse', 'shift', 'unshift', 'concat', 'find', 'some',
  'every', 'flat', 'flatMap', 'at', 'fill',
])
const STRING_METHODS = new Set([
  'charAt', 'charCodeAt', 'codePointAt', 'indexOf', 'includes', 'padStart', 'padEnd',
  'repeat', 'replace', 'replaceAll', 'slice', 'split', 'substring', 'toLowerCase',
  'toUpperCase', 'trim', 'trimStart', 'trimEnd', 'startsWith', 'endsWith', 'concat',
  'match', 'toString', 'localeCompare',
])
const NUMBER_METHODS = new Set(['toFixed', 'toPrecision'])
/** Methods that only exist on indexable collections (arrays and strings). */
const SEQUENCE_METHODS = new Set([
  'at', 'flat', 'flatMap', 'find', 'findIndex', 'entries', 'keys', 'values',
  'copyWithin', 'lastIndexOf',
])

/**
 * Infer one schema per parameter.
 * Returns `{ params, lengthLinks }` where `params` is ordered and `lengthLinks`
 * describes relationships such as "args[0].length === args[1]".
 */
export function inferParams(functionNode) {
  const { node } = functionNode
  const paramNames = new Map()
  node.params.forEach((param, i) => {
    if (param.type === 'Identifier') paramNames.set(param.name, i)
  })

  const info = new Map()
  for (const [name, index] of paramNames) {
    info.set(name, {
      index,
      name,
      type: 'unknown',
      score: { array: 0, string: 0, number: 0, boolean: 0, object: 0 },
      min: undefined,
      max: undefined,
      isLengthOf: undefined,
      accessesIndex: new Set(),
      comparisons: 0,
      inLoop: false,
      arithmetic: 0,
      recursiveGuard: false,
      earlyReturn: false,
      iterable: false,
    })
  }

  const get = (name) => info.get(name)
  const touch = (name) => {
    const entry = info.get(name)
    if (entry) entry.comparisons += 1
    return entry
  }

  eachNode(node, (n) => {
    switch (n.type) {
      // arr.length, str.length
      case 'MemberExpression': {
        if (n.property.type !== 'Identifier') break
        const prop = n.property.name
        const object = n.object

        if (prop === 'length' && object.type === 'Identifier') {
          const entry = touch(object.name)
          if (entry) entry.isLengthOf = { paramIndex: paramIndexOf(object, paramNames) }
          // `arr.length === n` or `n === arr.length` -> link
          return
        }

        // method calls on a param
        if (n.computed === false && object.type === 'Identifier') {
          const entry = info.get(object.name)
          if (!entry) break
          if (ARRAY_METHODS.has(prop)) entry.score.array += 3
          else if (STRING_METHODS.has(prop)) entry.score.string += 3
          else if (NUMBER_METHODS.has(prop)) entry.score.number += 3
        }

        // arr[i] -> arr is array-like
        if (object.type === 'Identifier') {
          const entry = info.get(object.name)
          if (entry) entry.accessesIndex.add(n.computed ? describeIndex(n.property) : String(n.property.name ?? '?'))
        }
        break
      }

      // for (const x of param) / for (let i = 0; i < n; i++)
      case 'ForOfStatement': {
        if (n.right && n.right.type === 'Identifier') {
          const entry = touch(n.right.name)
          if (entry) { entry.score.array += 4; entry.score.string += 1 }
        }
        break
      }

      case 'ForStatement': {
        const test = n.test
        if (test && test.type === 'BinaryExpression') {
          const rightIsParam = paramIndexOf(test.right, paramNames)
          if (rightIsParam !== undefined) {
            const entry = touch(test.right.name)
            if (entry) {
              entry.inLoop = true
              if (test.operator === '<') entry.min = Math.max(entry.min ?? -Infinity, 0)
              if (test.operator === '<=') entry.min = Math.max(entry.min ?? -Infinity, 1)
            }
          }
          const leftIsParam = paramIndexOf(test.left, paramNames)
          if (leftIsParam !== undefined) {
            const entry = touch(test.left.name)
            if (entry) {
              entry.inLoop = true
              if (test.operator === '>') entry.min = Math.max(entry.min ?? -Infinity, 0)
              if (test.operator === '>=') entry.min = Math.max(entry.min ?? -Infinity, 1)
            }
          }
          // i < arr.length
          if (test.operator === '<' && test.right.type === 'MemberExpression'
              && test.right.property.type === 'Identifier' && test.right.property.name === 'length'
              && test.right.object.type === 'Identifier') {
            const entry = touch(test.right.object.name)
            if (entry) entry.score.array += 4
          }
        }
        break
      }

      // n - 1, n + 1, n * 2 -> numeric parameter
      case 'BinaryExpression': {
        const leftParam = paramIndexOf(n.left, paramNames)
        const rightParam = paramIndexOf(n.right, paramNames)
        const ARITH = new Set(['+', '-', '*', '/', '%', '**'])
        const COMPARE = new Set(['<', '<=', '>', '>=', '===', '!==', '==', '!='])

        if (ARITH.has(n.operator)) {
          if (leftParam !== undefined) get(n.left.name).arithmetic += 2
          if (rightParam !== undefined) get(n.right.name).arithmetic += 2
          // n - 1 gives an upper bound for the loop bound
          if (leftParam !== undefined && n.right.type === 'Literal' && typeof n.right.value === 'number'
              && (n.operator === '-' || n.operator === '+')) {
            const entry = get(n.left.name)
            const bound = n.operator === '-' ? n.right.value - 1 : n.right.value + 1
            if (n.operator === '-' && n.right.value === 1) {
              entry.recursiveGuard = true
              entry.min = entry.min ?? 1
            }
            entry.max = entry.max === undefined ? bound : Math.max(entry.max, bound)
          }
        }

        if (COMPARE.has(n.operator)) {
          if (leftParam !== undefined) {
            const e = touch(n.left.name)
            if (n.right.type === 'Literal' && typeof n.right.value === 'number') {
              applyBound(e, n.operator, n.left, n.right.value)
            }
          }
          if (rightParam !== undefined) {
            const e = touch(n.right.name)
            if (n.left.type === 'Literal' && typeof n.left.value === 'number') {
              applyBound(e, flip(n.operator), n.right, n.left.value)
            }
          }
        }
        break
      }

      // Math.max(param, ...) / Math.floor(param)
      case 'CallExpression': {
        const callee = n.callee
        if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier'
            && callee.object.name === 'Math') {
          for (const arg of n.arguments) {
            const idx = paramIndexOf(arg, paramNames)
            if (idx !== undefined) get(arg.name).score.number += 2
          }
        }
        if (callee.type === 'Identifier' && callee.name === 'String' ) {
          for (const arg of n.arguments) {
            const idx = paramIndexOf(arg, paramNames)
            if (idx !== undefined) get(arg.name).score.string += 3
          }
        }
        if (callee.type === 'Identifier' && (callee.name === 'parseInt' || callee.name === 'Number')) {
          for (const arg of n.arguments) {
            const idx = paramIndexOf(arg, paramNames)
            if (idx !== undefined) get(arg.name).score.number += 3
          }
        }
        break
      }

      // new Set(nums) / new Map(entries) -> collection parameter
      case 'NewExpression': {
        if (n.callee.type === 'Identifier' && ['Set', 'Map', 'WeakSet', 'WeakMap', 'Array'].includes(n.callee.name)) {
          for (const arg of n.arguments) {
            const idx = paramIndexOf(arg, paramNames)
            if (idx !== undefined) {
              const entry = info.get(arg.name)
              entry.score.array += 4
              entry.iterable = true
            }
          }
        }
        break
      }

      // [...nums] -> iterable parameter
      case 'SpreadElement': {
        const idx = paramIndexOf(n.argument, paramNames)
        if (idx !== undefined) {
          const entry = info.get(n.argument.name)
          entry.score.array += 3
          entry.iterable = true
        }
        break
      }

      // n.length, n.push(x), n.slice() -> sequence, even without an index read
      case 'CallExpression': {
        const callee = n.callee
        if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
          const entry = info.get(callee.object.name)
          if (entry) {
            const prop = callee.property.name
            if (typeof prop === 'string' && SEQUENCE_METHODS.has(prop)) {
              entry.iterable = true
              entry.score.array += 2
            }
          }
        }
        break
      }

      // unary !param -> boolean
      case 'UnaryExpression': {
        if (n.operator === '!' && n.argument.type === 'Identifier') {
          const idx = paramIndexOf(n.argument, paramNames)
          if (idx !== undefined) get(n.argument.name).score.boolean += 2
        }
        break
      }

      // object literal property -> object param
      case 'Property': {
        if (n.value && n.value.type === 'Identifier') {
          const idx = paramIndexOf(n.value, paramNames)
          if (idx !== undefined) get(n.value.name).score.object += 3
        }
        break
      }

      default:
        break
    }
  })

  // Resolve types from accumulated evidence.
  const stringish = detectStringEvidence(node, paramNames)
  const params = []
  for (const entry of info.values()) {
    const resolved = resolveType(entry)
    // "indexed + has .length" is genuinely ambiguous: it is an array *or* a
    // string. String operations break the tie, but only when we actually saw
    // one -- `reverseString` builds its output with `out = s[i] + out` and
    // never calls a string method on `s`, so guessing "array" there would
    // test the wrong input domain entirely. When the tie is unbroken we keep
    // 'sequence' and let the generator try both shapes.
    if (resolved.type === 'sequence' && stringish.has(entry.name)) {
      resolved.type = 'string'
      delete resolved.element
    }
    params[entry.index] = {
      index: entry.index,
      name: entry.name,
      ...resolved,
      ambiguous: resolved.type === 'sequence',
      min: entry.min,
      max: entry.max,
    }
  }

  // Cross-parameter length links: arr.length compared to another param.
  const lengthLinks = []
  eachNode(node, (n) => {
    if (n.type !== 'BinaryExpression') return
    if (!['===', '==', '>=', '<=', '>', '<'].includes(n.operator)) return
    const side = (side) => {
      if (side.type === 'MemberExpression' && side.property.type === 'Identifier'
          && side.property.name === 'length' && side.object.type === 'Identifier') {
        const idx = paramIndexOf(side.object, paramNames)
        return idx === undefined ? undefined : { arrayIndex: idx }
      }
      const idx = paramIndexOf(side, paramNames)
      return idx === undefined ? undefined : { lengthIndex: idx }
    }
    const a = side(n.left)
    const b = side(n.right)
    if (a?.arrayIndex !== undefined && b?.lengthIndex !== undefined) {
      lengthLinks.push({ arrayIndex: a.arrayIndex, lengthIndex: b.lengthIndex })
    }
  })

  return { params, lengthLinks }
}

function describeIndex(node) {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'Literal') return String(node.value)
  return 'expr'
}

function flip(op) {
  const map = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '===': '===', '==': '==', '!==': '!==', '!=': '!=' }
  return map[op] ?? op
}

function applyBound(entry, operator, side, literal) {
  if (!entry) return
  // side is the parameter node; bounds are interpreted on the parameter value.
  switch (operator) {
    case '>': entry.min = Math.max(entry.min ?? -Infinity, literal + 1); break
    case '>=': entry.min = Math.max(entry.min ?? -Infinity, literal); break
    case '<': entry.max = entry.max === undefined ? literal - 1 : Math.min(entry.max, literal - 1); break
    case '<=': entry.max = entry.max === undefined ? literal : Math.min(entry.max, literal); break
    case '===': case '==': entry.min = literal; entry.max = literal; break
    default: break
  }
}

function resolveType(entry) {
  const { score } = entry
  let type = 'unknown'
  let best = 0
  for (const [candidate, weight] of Object.entries(score)) {
    const value = weight + (candidate === 'number' ? entry.arithmetic : 0)
    if (value > best) { best = value; type = candidate }
  }

  if (best === 0) {
    // No method calls told us anything. But a parameter that is both indexed
    // with [..] and has .length read is a *sequence*: an array or a string.
    // Conflating the two is exactly how "reverse a string" slips past a
    // fuzzer that only tries numbers.
    if (entry.accessesIndex.size > 0 && entry.isLengthOf !== undefined) {
      return { type: 'sequence', element: { type: 'number' } }
    }
    if (entry.accessesIndex.size > 0) return { type: 'sequence', element: { type: 'number' } }
    // A collection method call or a Set/Map construction is enough on its own.
    if (entry.iterable) return { type: 'sequence', element: { type: 'number' } }
    return { type: 'unknown' }
  }

  if (type === 'array') {
    return { type: 'array', element: guessElementType(entry) }
  }
  return { type }
}

function guessElementType(entry) {
  // Element-level type inference stays coarse for now: numeric elements are the
  // overwhelming majority of functions that take an array, and generating a
  // string element where a number is expected is itself a valid finding.
  return { type: 'number' }
}

/**
 * Walk the function body and record, for each parameter, whether it is compared
 * against or coerced to a string literal. Used as a tiebreaker to split
 * 'sequence' into 'array' or 'string'.
 */
function detectStringEvidence(node, paramNames) {
  const stringish = new Set()
  const stringLocals = new Set()
  walk.full(node, (n) => {
    if (n.type === 'BinaryExpression' && n.operator === '+') {
      if (n.right.type === 'Literal' && typeof n.right.value === 'string') {
        const idx = paramIndexOf(n.left, paramNames)
        if (idx !== undefined) stringish.add(n.left.name)
      }
      if (n.left.type === 'Literal' && typeof n.left.value === 'string') {
        const idx = paramIndexOf(n.right, paramNames)
        if (idx !== undefined) stringish.add(n.right.name)
      }
    }
    if (n.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(n.operator)) {
      for (const side of [n.left, n.right]) {
        if (side.type === 'Literal' && typeof side.value === 'string') {
          const other = side === n.left ? n.right : n.left
          const idx = paramIndexOf(other, paramNames)
          if (idx !== undefined) stringish.add(other.name)
        }
      }
    }
    // s[i] + <string-typed variable> or s[i] + '' : the sequence holds strings.
    // Tracking the declaration type of `out` is enough to catch the common
    // accumulator idiom (`let out = ''; ... out = s[i] + out`).
    if (n.type === 'VariableDeclarator' && n.init?.type === 'Literal'
        && typeof n.init.value === 'string' && n.id.type === 'Identifier') {
      stringLocals.add(n.id.name)
    }
    if (n.type === 'BinaryExpression' && n.operator === '+') {
      for (const side of [n.left, n.right]) {
        const idx = paramIndexOf(side, paramNames)
        if (idx !== undefined && stringish.has(side.name) === false) {
          const other = side === n.left ? n.right : n.left
          if (other.type === 'Identifier' && stringLocals.has(other.name)) {
            stringish.add(side.name)
          }
          if (other.type === 'Literal' && typeof other.value === 'string') {
            stringish.add(side.name)
          }
        }
      }
    }
    // elementOfSequence.toLowerCase() etc.
    if (n.type === 'MemberExpression' && n.property.type === 'Identifier') {
      if (STRING_METHODS.has(n.property.name) && n.object.type === 'MemberExpression'
          && n.object.computed && n.object.object.type === 'Identifier') {
        const idx = paramIndexOf(n.object.object, paramNames)
        if (idx !== undefined) stringish.add(n.object.object.name)
      }
    }
  })
  return stringish
}

/** Best-effort read of a JSDoc `@param {number[]} arr` line. */
export function parseJsDoc(code, functionName) {
  const docs = new Map()
  const re = new RegExp(`@param\\s+\\{([^}]+)\\}\\s*\\[?([A-Za-z0-9_$]+)`)
  const lines = code.split('\n')
  for (const line of lines) {
    if (!line.includes('@param')) continue
    const m = line.match(re)
    if (m) docs.set(m[2], m[1].trim())
  }
  return docs
}

export function jsDocTypeToSchema(raw) {
  if (!raw) return undefined
  const cleaned = raw.toLowerCase()
  if (cleaned.includes('boolean')) return { type: 'boolean' }
  if (cleaned.includes('string')) return { type: 'string' }
  if (cleaned.includes('number') || cleaned.includes('int')) return { type: 'number' }
  if (cleaned.includes('[]') || cleaned.includes('array')) return { type: 'array', element: { type: 'number' } }
  if (cleaned.includes('object')) return { type: 'object' }
  return undefined
}