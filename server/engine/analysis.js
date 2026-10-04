/**
 * Orchestrator: the whole pipeline in one function, from pasted source to a
 * report a judge can read in ten seconds.
 */

import { inferParams, jsDocTypeToSchema, parseJsDoc, resolveTarget, AnalysisError } from './analyze.js'
import { generateInputs, makeRandom } from './generator.js'
import { compileOracle, callVerified, findFirstDisagreement, getLibraryOracle, guessSignature, synthesizeOracle, buildRangePolicy, subjectAccepts, POLICY_PRESETS, resolvePolicy } from './oracles.js'
import { callFn, compile, deepEqual, formatCall } from './sandbox.js'
import { minimize, describeMinimal } from './shrinker.js'
import { explainFinding, getLlmClient, mutationScore } from './llm.js'
import { CLASS_ADVICE, classifyFinding } from './classify.js'

/**
 * Budgets are tuned for a live demo, not for a benchmark. The engine already
 * converges long before these caps in almost every case -- they exist to bound
 * the pathological tail so a submission never appears to hang. Found bugs
 * typically land around 2s; these only matter for code that is hard to break.
 */
const DEFAULT_BUDGETS = {
  maxInputs: 4000,
  perCallTimeoutMs: 40,
  totalBudgetMs: 2500,
  shrinkBudgetMs: 2500,
}

export async function analyze(request, options = {}) {
  const startedAt = Date.now()
  const budgets = { ...DEFAULT_BUDGETS, ...options.budgets }

  const code = String(request.code ?? '')
  if (code.trim().length === 0) throw new AnalysisError('No code submitted.')
  if (code.length > 40000) throw new AnalysisError('Submission is too large (40KB limit).')

  // ---- 1. Parse and locate the target function -----------------------------
  const target = resolveTarget(code, request.functionName || undefined)
  const functionName = target.name

  const inferred = inferParams(target)
  const docs = parseJsDoc(code, functionName)
  const params = inferred.params.map((param) => {
    const docType = jsDocTypeToSchema(docs.get(param.name))
    return docType ? { ...param, ...docType, source: 'jsdoc' } : { ...param, source: 'inferred' }
  })

  const subject = compile(code, functionName)
  const baseline = callVerified(subject.context, functionName, sampleArgs(params), 200)

  // ---- 2. Obtain an independent oracle ------------------------------------
  const oracleInfo = await resolveOracle({ request, target, functionName, params, options })

  if (!oracleInfo) {
    // ---- 2b. No oracle: still hunt for what needs no reference ---------------
    // The pitch is "paste any function". For anything outside the built-in
    // library there is no oracle, and the useful answer is not "sorry" -- a
    // crash and a hang are both provable against a single implementation.
    return analyzeWithoutOracle({
      startedAt,
      subject,
      code,
      functionName,
      params,
      lengthLinks: inferred.lengthLinks,
      baseline,
      budgets,
      seed: request.seed ?? 1337,
    })
  }

  const oracle = compileOracle(oracleInfo.code, functionName)
  const mode = oracleInfo.mode ?? 'value'
  if (!oracle) {
    return {
      status: 'oracle-missing',
      functionName,
      params,
      baseline: summarizeCall(baseline),
      message: 'The reference implementation failed to compile, so no comparison was possible.',
      analysisMs: Date.now() - startedAt,
    }
  }

  // ---- 3. Differential fuzzing --------------------------------------------
  const fuzz = runFuzz({
    subjectCtx: subject.context,
    oracleCtx: oracle.context,
    functionName,
    params,
    lengthLinks: inferred.lengthLinks,
    budgets,
    seed: request.seed ?? 1337,
    mode,
    strictOnly: Boolean(oracleInfo.strictOnly),
  })

  // ---- 4. Shrink the counterexample ---------------------------------------
  let minimal = null
  let finding = null

  if (fuzz.finding) {
    const reproduces = makeReproducer({
      subjectCtx: subject.context,
      oracleCtx: oracle.context,
      functionName,
      perCallTimeoutMs: Math.min(budgets.perCallTimeoutMs * 2, 120),
      mode,
      verdict: fuzz.finding.verdict,
      strictOnly: Boolean(oracleInfo.strictOnly),
    })

    const seedArgs = fuzz.finding.args
    let shrunk = seedArgs
    try {
      shrunk = minimize(reproduces, seedArgs, {
        deadline: Date.now() + budgets.shrinkBudgetMs,
        schemas: params,
      })
    } catch {
      shrunk = seedArgs
    }

    // Confirm the final answer and capture outputs for display.
    const subjectFinal = callVerified(subject.context, functionName, shrunk, 200)
    const oracleFinal = callVerified(oracle.context, functionName, shrunk, 200)

    // In accept mode the interesting pair is two verdicts, not two return
    // values. Showing the raw subject return here would read as
    // "expected reject, actual null" -- true, but unreadable for anyone
    // reviewing a finding.
    const verdicts =
      mode === 'accept' && subjectFinal.status === 'ok' && oracleFinal.status === 'ok'
        ? {
            expected: oracleFinal.value === true ? 'accept' : 'reject',
            actual: subjectAccepts(subjectFinal.value) ? 'accept' : 'reject',
          }
        : {
            expected: oracleFinal.status === 'ok' ? oracleFinal.value : fuzz.finding.expected,
            actual: subjectFinal.status === 'ok' ? subjectFinal.value : fuzz.finding.actual,
          }

    finding = {
      ...fuzz.finding,
      args: shrunk,
      call: formatCall(functionName, shrunk),
      originalCall: formatCall(functionName, seedArgs),
      reduction: fuzz.finding.args.length ? shrinkRatio(seedArgs, shrunk) : 1,
      ...verdicts,
      errorMessage: subjectFinal.status === 'threw' ? subjectFinal.error : finding?.error,
    }
    minimal = describeMinimal(functionName, shrunk)
  }

  // ---- 5. Mutation score ----------------------------------------------------
  let score = null
  if (finding) {
    try {
      score = mutationScore(code, functionName, finding.args, (mutatedCode, args) => {
        const mutated = compile(mutatedCode, functionName, { captureConsole: false })
        const subjectResult = callVerified(mutated.context, functionName, args, 120)
        const oracleResult = callVerified(oracle.context, functionName, args, 120)
        if (subjectResult.status === 'unstable') return 'unstable'
        if (subjectResult.status !== 'ok') return 'threw'
        if (oracleResult.status !== 'ok') return 'agree'
        if (mode === 'accept') {
          return subjectAccepts(subjectResult.value) === (oracleResult.value === true) ? 'agree' : 'wrong'
        }
        return deepEqual(subjectResult.value, oracleResult.value) ? 'agree' : 'wrong'
      })
    } catch {
      score = null
    }
  }

  // ---- 6. Classify -----------------------------------------------------------
  // Name the kind of mistake, not just the input. Heuristic, and reported as
  // such: the benchmark measures how often it is right.
  const bugClass = finding ? classifyFinding(finding, code) : null
  const advice = bugClass ? CLASS_ADVICE[bugClass] ?? null : null

  // ---- 7. Explain ------------------------------------------------------------
  const explanation = finding
    ? await explainFinding(finding, {
      subjectCode: code,
      oracleCode: oracleInfo.code,
      functionName,
      signal: options.signal,
    })
    : null

  return {
    status: finding ? 'counterexample-found' : 'no-counterexample-found',
    functionName,
    params,
    oracle: {
      signature: oracleInfo.signature,
      summary: oracleInfo.summary,
      source: oracleInfo.source,
      code: oracleInfo.code,
      mode,
    },
    baseline: summarizeCall(baseline),
    stats: fuzz.stats,
    finding,
    minimal,
    bugClass,
    advice,
    mutationScore: score,
    explanation,
    logs: subject.logs.slice(0, 20),
    analysisMs: Date.now() - startedAt,
  }
}

function sampleArgs(params) {
  return params.map((param) => {
    switch (param.type) {
      case 'number': return 1
      case 'string': return 'a'
      case 'boolean': return true
      case 'array': return []
      case 'object': return {}
      default: return 1
    }
  })
}

function summarizeCall(result) {
  if (result.status === 'ok') return { status: 'ok', value: result.value }
  return { status: result.status, error: result.error }
}

async function resolveOracle({ request, target, functionName, params, options }) {
  // A validator is checked by policy, so it is resolved before the value oracle
  // library. A name beats an explicit oracle only in the sense that a policy
  // and an implementation are different kinds of reference; both still lose to
  // something the user wrote themselves.
  const policy = request.policy ?? (request.policyName ? POLICY_PRESETS[request.policyName] : undefined)
  if (policy) {
    const { min, max, integer = true } = policy
    return {
      signature: `policy:${JSON.stringify({ min, max, integer })}`,
      summary:
        `Policy: accept ${integer ? 'integers' : 'numbers'} from ${min} to ${max}. ` +
        'The reference is written strictly -- it rejects NaN, infinities and non-numbers -- because that ' +
        'is the part a hand-written check usually forgets.',
      code: buildRangePolicy(policy),
      mode: 'accept',
      source: request.policyName ? 'policy-preset' : 'policy',
    }
  }

  // Explicit oracle wins.
  if (request.oracleCode && request.oracleCode.trim()) {
    return {
      signature: 'user-supplied',
      summary: 'Reference implementation you provided.',
      code: request.oracleCode,
      source: 'user',
      mode: request.oracleMode === 'accept' ? 'accept' : 'value',
    }
  }

  const requested = request.oracleSignature
  if (requested) {
    const named = getLibraryOracle(requested)
    if (named) return { ...named, source: 'library', mode: 'value' }
  }

  // Zero-setup path: a validator is recognised from its own name and shape, so
  // pasting one finds its bypass without the user choosing a policy first.
  //
  // This has to run before `guessSignature`, which maps "one numeric parameter"
  // to a primality oracle. Left in that order, a quantity validator gets handed
  // `isPrime` and the tool confidently compares two unrelated answers -- the
  // worst possible failure on the one class of function a security reviewer is
  // relying on it for.
  const detected = resolvePolicy({ functionName, params })
  if (detected) return detected

  const signature = requested || guessSignature(functionName, params)
  const library = signature ? getLibraryOracle(signature) : null
  if (library) {
    return { ...library, source: 'library', mode: 'value' }
  }

  const spec = request.spec || extractDocSpec(request.code)
  const llm = getLlmClient()
  const synthesized = await synthesizeOracle({ functionName, params, spec, llm, signal: options.signal })
  if (synthesized) return { ...synthesized, source: 'model', mode: 'value' }

  return null
}

/** Pull a spec out of a leading block comment, if the author left one. */
export function extractDocSpec(code) {
  const match = code.match(/\/\*\*([\s\S]*?)\*\//)
  if (!match) return null
  const text = match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*ap?/, '').replace(/^\s*\*ap?/, '').replace(/^\s*\*?\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
  return text.slice(0, 800)
}

function runFuzz({ subjectCtx, oracleCtx, functionName, params, lengthLinks, budgets, seed, mode = 'value', strictOnly = false }) {
  const deadline = Date.now() + budgets.totalBudgetMs
  let tested = 0
  let agreementCount = 0
  let finding = null
  const failureCounts = { threw: 0, timeout: 0, wrong: 0, nondeterministic: 0 }

  const iterator = generateInputs(params, budgets.maxInputs, seed, { lengthLinks })

  for (const args of iterator) {
    if (Date.now() > deadline) break
    tested += 1

    const result = findFirstDisagreement(subjectCtx, oracleCtx, functionName, args, {
      perCallTimeoutMs: budgets.perCallTimeoutMs,
      mode,
      policyStrictOnly: strictOnly,
    })

    if (result.kind === 'agree') { agreementCount += 1; continue }
    if (result.kind === 'skip') continue

    failureCounts[result.kind === 'wrong-answer' ? 'wrong' : result.kind] += 1
    if (!finding) {
      finding = { ...result, call: formatCall(functionName, args) }
    }
  }

  return {
    finding,
    stats: {
      inputsTested: tested,
      agreements: agreementCount,
      timeBudgetMs: budgets.totalBudgetMs,
      hitBudget: Date.now() >= deadline,
      failures: failureCounts,
    },
  }
}

/**
 * Build a predicate the shrinker can call cheaply. It re-runs the differential
 * comparison at a slightly looser timeout so shrinking does not fail merely
 * because a smaller input is slower.
 *
 * Timeouts use `callVerified`, which retries before believing one. Without that
 * the shrinker minimises *towards* a garbage-collection pause and reports a
 * perfectly correct function as non-terminating.
 */
function makeReproducer({ subjectCtx, oracleCtx, functionName, perCallTimeoutMs, mode = 'value', verdict, strictOnly = false }) {
  return (args) => {
    const subject = callVerified(subjectCtx, functionName, args, perCallTimeoutMs)
    if (subject.status === 'unstable') return false
    if (subject.status === 'timeout') return true
    if (subject.status === 'threw') {
      const oracle = callVerified(oracleCtx, functionName, args, perCallTimeoutMs)
      return oracle.status === 'ok'
    }
    const oracle = callVerified(oracleCtx, functionName, args, perCallTimeoutMs)
    if (oracle.status !== 'ok') return false
    if (mode === 'accept') {
      const subjectVerdict = subjectAccepts(subject.value)
      const policyVerdict = oracle.value === true
      if (subjectVerdict === policyVerdict) return false
      // Reproduce the same *direction* of failure the seed found. Without this
      // the shrinker can drift onto the opposite one -- minimising a bypass into
      // a false rejection, which would ship a counterexample that is not the
      // bug we actually found.
      const here = subjectVerdict && !policyVerdict ? 'bypass' : 'false-rejection'
      if (here === 'false-rejection' && strictOnly) return false
      return verdict ? here === verdict : true
    }
    return !deepEqual(subject.value, oracle.value)
  }
}

function shrinkRatio(before, after) {
  const beforeSize = before.reduce((sum, a) => sum + (Array.isArray(a) ? a.length : 1), 0)
  const afterSize = after.reduce((sum, a) => sum + (Array.isArray(a) ? a.length : 1), 0)
  if (beforeSize === 0) return 1
  return Math.max(0, Math.round((1 - afterSize / beforeSize) * 100))
}

/**
 * Hunt for crashes and hangs with no reference implementation to compare
 * against.
 *
 * Two failure classes need no oracle, because they are defects of the function
 * alone rather than disagreements between two of them: an uncaught exception,
 * and a call that never returns. Both are still counterexamples, and both are
 * what a user who pasted an arbitrary function actually gets back.
 *
 * The boundary-biased generator and `callVerified` are reused unchanged, so the
 * guard against reporting a garbage-collection pause as an infinite loop applies
 * here exactly as it does on the differential path.
 */
function runSelfFuzz({ subjectCtx, functionName, params, lengthLinks, budgets, seed }) {
  const deadline = Date.now() + budgets.totalBudgetMs
  let tested = 0
  let agreementCount = 0
  let inconclusive = 0
  let finding = null
  const failureCounts = { threw: 0, timeout: 0, wrong: 0, nondeterministic: 0 }

  const iterator = generateInputs(params, budgets.maxInputs, seed, { lengthLinks })

  for (const args of iterator) {
    if (Date.now() > deadline) break
    tested += 1

    const result = callVerified(subjectCtx, functionName, args, budgets.perCallTimeoutMs)

    if (result.status === 'ok') { agreementCount += 1; continue }
    // A result that depended on machine load is not evidence of anything.
    if (result.status === 'unstable') { inconclusive += 1; continue }

    failureCounts[result.status] += 1
    if (!finding) {
      finding = {
        kind: result.status,
        args,
        call: formatCall(functionName, args),
        error: result.error,
        expected: undefined,
        actual: undefined,
      }
    }
  }

  return {
    finding,
    inconclusive,
    stats: {
      inputsTested: tested,
      agreements: agreementCount,
      timeBudgetMs: budgets.totalBudgetMs,
      hitBudget: Date.now() >= deadline,
      failures: failureCounts,
    },
  }
}

/** A shrinker predicate that reproduces one specific crash class on its own. */
function makeSelfReproducer({ subjectCtx, functionName, kind, perCallTimeoutMs }) {
  return (args) => {
    const result = callVerified(subjectCtx, functionName, args, perCallTimeoutMs)
    if (result.status === 'unstable') return false
    if (kind === 'timeout') return result.status === 'timeout'
    if (kind === 'threw') return result.status === 'threw'
    return false
  }
}

/**
 * Report what a single implementation can prove about itself.
 *
 * Returns a real counterexample when the code crashes or hangs, and an honest
 * dead end when it does neither. The dead end now states what was actually
 * tried and how many inputs it cost, instead of implying nothing ran.
 */
function analyzeWithoutOracle({ startedAt, subject, code, functionName, params, lengthLinks, baseline, budgets, seed }) {
  const fuzz = runSelfFuzz({
    subjectCtx: subject.context,
    functionName,
    params,
    lengthLinks,
    budgets,
    seed,
  })

  if (!fuzz.finding) {
    return {
      status: 'oracle-missing',
      functionName,
      params,
      baseline: summarizeCall(baseline),
      message:
        `We ran ${fuzz.stats.inputsTested.toLocaleString()} generated inputs and found no crash and ` +
        'no hang. Without a reference implementation we cannot tell you whether the answers were ' +
        'right, so this is not evidence your code is correct. Add a short spec in the "Task spec" ' +
        'box and run again to enable the full differential check.',
      analysisMs: Date.now() - startedAt,
    }
  }

  const seedArgs = fuzz.finding.args
  let shrunk = seedArgs
  try {
    shrunk = minimize(
      makeSelfReproducer({
        subjectCtx: subject.context,
        functionName,
        kind: fuzz.finding.kind,
        perCallTimeoutMs: Math.min(budgets.perCallTimeoutMs * 2, 120),
      }),
      seedArgs,
      { deadline: Date.now() + budgets.shrinkBudgetMs, schemas: params },
    )
  } catch {
    shrunk = seedArgs
  }

  // Re-run the survivor so the displayed error is the real one.
  const final = callVerified(subject.context, functionName, shrunk, 200)
  const finding = {
    kind: fuzz.finding.kind,
    args: shrunk,
    call: formatCall(functionName, shrunk),
    originalCall: formatCall(functionName, seedArgs),
    reduction: seedArgs.length ? shrinkRatio(seedArgs, shrunk) : 1,
    expected: undefined,
    actual: undefined,
    errorMessage: final.status === 'threw' ? final.error : fuzz.finding.error,
  }

  const bugClass = classifyFinding(finding, code)
  const advice = bugClass ? CLASS_ADVICE[bugClass] ?? null : null

  return {
    status: 'counterexample-found',
    functionName,
    params,
    oracle: {
      signature: 'none',
      summary: 'No reference was available, so this reports a defect your function shows on its own.',
      source: 'none',
      code: '',
    },
    baseline: summarizeCall(baseline),
    stats: fuzz.stats,
    finding,
    minimal: describeMinimal(functionName, shrunk),
    bugClass,
    advice,
    // A crash test cannot be scored against mutations without a reference to
    // compare them to, so this stays absent rather than invented.
    mutationScore: null,
    explanation: selfOnlyExplanation(finding.kind),
    logs: subject.logs.slice(0, 20),
    analysisMs: Date.now() - startedAt,
  }
}

function selfOnlyExplanation(kind) {
  if (kind === 'timeout') {
    return {
      summary: 'This input never returns.',
      detail:
        'We ran the call under a wall-clock budget and retried it at four times that budget before ' +
        'believing it. Surviving both means the loop is in your code, not in the machine. A call ' +
        'that does not terminate takes the whole process with it in most runtimes.',
      confidence: 'heuristic',
    }
  }
  return {
    summary: 'This input throws an uncaught exception.',
    detail:
      'The call raised an error instead of returning a value. No reference implementation was ' +
      'available, so we report only what is provable from your code alone: it does not survive this ' +
      'input. What it should have returned instead is unknown to us without a reference.',
    confidence: 'heuristic',
  }
}

export { makeRandom }