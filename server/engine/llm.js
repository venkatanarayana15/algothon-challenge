/**
 * LLM client: small, dependency-free, and always optional.
 *
 * Every call has a short timeout and returns null on failure. The product must
 * produce a useful result with no key, no network, and a flaky provider -- the
 * model is an enhancement, never a dependency.
 */

const PROVIDERS = {
  gemini: {
    endpoint: (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    body: (prompt, opts) => ({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: opts.maxTokens, temperature: opts.temperature ?? 0 },
    }),
    extract: (json) => json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? null,
    env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  },
  groq: {
    endpoint: (key) => 'https://api.groq.com/openai/v1/chat/completions',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    body: (prompt, opts) => ({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0,
    }),
    extract: (json) => json?.choices?.[0]?.message?.content ?? null,
    env: ['GROQ_API_KEY'],
  },
  openrouter: {
    endpoint: (key) => 'https://openrouter.ai/api/v1/chat/completions',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    body: (prompt, opts) => ({
      model: 'deepseek/deepseek-chat-v3.1:free',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0,
    }),
    extract: (json) => json?.choices?.[0]?.message?.content ?? null,
    env: ['OPENROUTER_API_KEY'],
  },
}

let cachedConfig = null

export function getLlmConfig(env = process.env) {
  if (cachedConfig) return cachedConfig
  for (const [name, provider] of Object.entries(PROVIDERS)) {
    for (const key of provider.env) {
      if (env[key]) {
        cachedConfig = { name, ...provider, key: env[key] }
        return cachedConfig
      }
    }
  }
  cachedConfig = null
  return null
}

/** Reset the cached provider lookup -- used by tests. */
export function resetLlmConfig() {
  cachedConfig = null
}

/**
 * Single-shot completion. Returns the text, or null if anything goes wrong.
 * A memory fallback keeps the demo alive with zero configuration.
 */
export async function complete(prompt, { maxTokens = 700, temperature = 0, timeoutMs = 12000, signal } = {}) {
  const config = getLlmConfig()
  if (!config) return null

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) return null
    signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(config.endpoint(config.key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.headers?.(config.key) ?? {}) },
      body: JSON.stringify(config.body(prompt, { maxTokens, temperature })),
      signal: controller.signal,
    })
    if (!response.ok) return null
    const json = await response.json()
    return config.extract(json)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Chat-style client matching the interface `oracles.js` expects. */
export function getLlmClient() {
  return { complete }
}

/**
 * Static, deterministic explanation used when no model is reachable. Catches the
 * handful of failure shapes that account for most real bugs.
 */
export function heuristicExplanation(finding) {
  const { kind, args, message } = finding
  switch (kind) {
    case 'timeout':
      return {
        summary: 'Your function did not terminate within the per-call budget.',
        detail: 'Usually an off-by-one in a loop bound, a `<=` where `<` was needed, or a recursion with no base case for the smallest valid input.',
        confidence: 'heuristic',
      }
    case 'threw':
      return {
        summary: `Your function threw on this input: ${message ?? 'unknown error'}`,
        detail: 'The failing input is a boundary case your code assumes cannot happen. Guard it, or fix the condition that lets it through.',
        confidence: 'heuristic',
      }
    case 'wrong-answer': {
      const empty = args.some((a) => Array.isArray(a) && a.length === 0)
      const zero = args.some((a) => a === 0)
      if (empty) {
        return {
          summary: 'The disagreement happens on an empty array.',
          detail: 'Empty inputs break initial-value patterns such as `let best = nums[0]` or `result[0]`. Decide explicitly what the function should return for an empty array.',
          confidence: 'heuristic',
        }
      }
      if (zero) {
        return {
          summary: 'The disagreement happens when an argument is zero.',
          detail: 'Zero is the classic trigger for off-by-one errors: `i > 0` should usually be `i >= 0`, and `i < n - 1` should usually be `i < n`.',
          confidence: 'heuristic',
        }
      }
      return {
        summary: 'Your function and the reference implementation disagree on this input.',
        detail: 'Walk the two implementations side by side and find the first line where they take different branches. The shrinking process guarantees the input is minimal.',
        confidence: 'heuristic',
      }
    }
    case 'nondeterministic':
      return {
        summary: 'Two calls with identical input returned different results.',
        detail: 'Something outside the arguments is influencing the result: `Math.random()`, `Date.now()`, uninitialised memory, iteration order over object keys, or a mutated shared array.',
        confidence: 'heuristic',
      }
    default:
      return null
  }
}

/**
 * Ask the model to explain the bug and propose a fix.
 * Returns `{ summary, detail, patch }` or null.
 */
export async function explainFinding(finding, { subjectCode, oracleCode, functionName, signal }) {
  const heuristic = heuristicExplanation(finding)
  const prompt = [
    'You are explaining a bug found by differential testing.',
    '',
    `Function under test: ${functionName}`,
    `Failure kind: ${finding.kind}`,
    `Smallest failing call: ${finding.call ?? ''}`,
    finding.expected !== undefined ? `Reference output: ${JSON.stringify(finding.expected)}` : '',
    finding.actual !== undefined ? `Actual output: ${JSON.stringify(finding.actual)}` : '',
    finding.message ? `Error: ${finding.message}` : '',
    '',
    'Submission source:',
    '```js',
    subjectCode,
    '```',
    '',
    'Independent reference implementation:',
    '```js',
    oracleCode,
    '```',
    '',
    'Reply with strict JSON only, no prose, no markdown fence:',
    '{"summary":"one sentence naming the root cause","detail":"two sentences on why this input triggers it and how to fix it","patch":"optional unified diff string or empty string"}',
  ].filter(Boolean).join('\n')

  const raw = await complete(prompt, { maxTokens: 600, temperature: 0, signal, timeoutMs: 14000 })
  if (!raw) return heuristic

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return heuristic
  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.summary) return heuristic
    return { summary: parsed.summary, detail: parsed.detail ?? '', patch: parsed.patch ?? '', confidence: 'model' }
  } catch {
    return heuristic
  }
}

/**
 * Mutation score: flip a few operators in the submission and check that the
 * counterexample family actually kills them. This is the "did you really test
 * it" evidence, and it is cheap to compute from a single known-failing input.
 */
export const MUTATIONS = [
  { id: 'loop-bound', label: 'loop bound < → <=', apply: (src) => src.replace(/i\s*<\s*([A-Za-z0-9_.]+)/g, 'i <= $1') },
  { id: 'loop-bound-off', label: 'loop bound <= → <', apply: (src) => src.replace(/i\s*<=\s*([A-Za-z0-9_.]+)/g, 'i < $1') },
  { id: 'gt-off', label: '> → >=', apply: (src) => src.replace(/([A-Za-z0-9_.]+)\s*>\s*([A-Za-z0-9_.]+)/g, '$1 >= $2') },
  { id: 'lt-off', label: '< → <=', apply: (src) => src.replace(/([A-Za-z0-9_.]+)\s*<\s*([A-Za-z0-9_.]+)/g, '$1 <= $2') },
  { id: 'zero-init', label: 'initial value 0 → -Infinity', apply: (src) => src.replace(/=\s*0\s*;/g, '= -Infinity;') },
  { id: 'sub-plus', label: 'length - 1 → length', apply: (src) => src.replace(/length\s*-\s*1/g, 'length') },
]

/**
 * Score each mutation by whether the shrunk counterexample detects it.
 * Runs synchronously in-process against throwaway contexts.
 */
export function mutationScore(subjectCode, functionName, args, runCall) {
  const results = []
  for (const mutation of MUTATIONS) {
    const mutated = mutation.apply(subjectCode)
    if (mutated === subjectCode) continue
    let killed = false
    try {
      const outcome = runCall(mutated, args)
      // 'unstable' means the call was inconclusive (a load artefact), which is
      // not evidence of a kill. Counting it as one would inflate the score.
      killed = outcome !== 'agree' && outcome !== 'unstable'
    } catch {
      killed = true
    }
    results.push({ id: mutation.id, label: mutation.label, killed })
  }
  const killed = results.filter((r) => r.killed).length
  return {
    results,
    killed,
    total: results.length,
    ratio: results.length ? killed / results.length : 1,
  }
}