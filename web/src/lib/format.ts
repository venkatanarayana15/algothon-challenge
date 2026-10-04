/**
 * Tag the server uses for values JSON cannot carry. `Infinity`, `-Infinity` and
 * `NaN` all serialize to `null`, so the engine tags them instead and the report
 * can claim a function returned `-Infinity` without claiming it returned `null`.
 */
const NONFINITE_KEY = '$nonfinite'
const NONFINITE_TAGS = new Set(['NaN', 'Infinity', '-Infinity'])

/** Returns the tag when `value` is a tagged sentinel, otherwise null. */
function nonFiniteTag(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  // Exactly one key, so a real object is never mistaken for a sentinel.
  if (keys.length !== 1 || keys[0] !== NONFINITE_KEY) return null
  const tag = record[NONFINITE_KEY]
  return typeof tag === 'string' && NONFINITE_TAGS.has(tag) ? tag : null
}

/** Render an arbitrary value the way the engine does, for display only. */
export function formatValue(value: unknown, depth = 0): string {
  if (depth > 3) return '…'
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  const tag = nonFiniteTag(value)
  if (tag !== null) return tag

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN'
    if (value === Infinity) return 'Infinity'
    if (value === -Infinity) return '-Infinity'
    if (Object.is(value, -0)) return '-0'
    return String(value)
  }
  if (typeof value === 'string') {
    const shown = value.length > 40 ? `${value.slice(0, 40)}…` : value
    return JSON.stringify(shown)
  }
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.length > 12) {
      return `[${value.slice(0, 6).map((v) => formatValue(v, depth + 1)).join(', ')}, … ${value.length} items]`
    }
    return `[${value.map((v) => formatValue(v, depth + 1)).join(', ')}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object)
    if (keys.length === 0) return '{}'
    return `{ ${keys
      .slice(0, 6)
      .map((k) => `${k}: ${formatValue((value as Record<string, unknown>)[k], depth + 1)}`)
      .join(', ')} }`
  }
  return String(value)
}

/** Short, human label for each failure class. */
export const KIND_LABEL: Record<string, { label: string; tone: string }> = {
  'wrong-answer': { label: 'Wrong answer', tone: 'text-rose-300 border-rose-500/30 bg-rose-500/10' },
  threw: { label: 'Threw an exception', tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  timeout: { label: 'Did not terminate', tone: 'text-orange-300 border-orange-500/30 bg-orange-500/10' },
  nondeterministic: { label: 'Non-deterministic', tone: 'text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10' },
}

export const DIFFICULTY_TONE: Record<string, string> = {
  easy: 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10',
  medium: 'text-amber-300 border-amber-500/25 bg-amber-500/10',
  hard: 'text-rose-300 border-rose-500/25 bg-rose-500/10',
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

/** Copy helper that degrades gracefully on non-secure origins. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

/** A syntactically valid function name, or undefined when the input has none. */
export function detectFunctionName(code: string): string | undefined {
  const match = code.match(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)/)
  if (match) return match[1]
  const arrow = code.match(/\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/)
  return arrow?.[1]
}