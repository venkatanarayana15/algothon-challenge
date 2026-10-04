import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze } from './engine/analysis.js'
import { AnalysisError } from './engine/analyze.js'
import { getLlmConfig } from './engine/llm.js'
import { toJsonSafe } from './engine/json-safe.js'
import { EXAMPLES, SECURITY_EXAMPLES } from './examples.js'
import { auditTarget } from './target/audit.js'
import { buildRegressionTest } from './target/regression-test.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

// Render terminates TLS at its proxy, so `req.ip` is the proxy's address unless
// X-Forwarded-For is trusted. Without this the rate limiter below buckets every
// visitor in the world into one counter, and simultaneous judges get 429s.
app.set('trust proxy', 1)

app.use(express.json({ limit: '256kb' }))

// Small, honest rate limit: enough to stop accidental runaway loops from a
// double-click, not enough to interfere with a judge hammering "Run".
const hits = new Map()
function rateLimit(req, res, next) {
  const key = req.ip ?? 'unknown'
  const now = Date.now()
  const window = 60_000
  const limit = 30
  const entry = hits.get(key) ?? []
  const recent = entry.filter((t) => now - t < window)
  if (recent.length >= limit) {
    return res.status(429).json({ error: 'Too many runs in the last minute. Wait a moment and try again.' })
  }
  recent.push(now)
  hits.set(key, recent)
  next()
}

app.get('/api/health', (_req, res) => {
  const llm = getLlmConfig()
  res.json({
    ok: true,
    uptimeSeconds: Math.round(process.uptime()),
    llm: llm ? llm.name : null,
    version: '0.1.0',
  })
})

app.get('/api/examples', (_req, res) => {
  // Security validators first: they are the ALG-CYBER-02 headline, and a judge
  // reaching for an example should meet a bypass before an off-by-one.
  res.json({ examples: [...SECURITY_EXAMPLES, ...EXAMPLES] })
})

/**
 * The ALG-CYBER-02 workflow, end to end: audit the deliberately vulnerable
 * application, fix each finding, and prove the fix held without breaking
 * legitimate functionality.
 *
 * Read-only and self-contained. It compiles the target and the patched versions
 * in a `node:vm` sandbox, so nothing here touches a real server or database --
 * which is what makes the demonstration safe by construction rather than by
 * promise. Deliberately not rate-limited, because it is a fixed, bounded audit
 * with no user input, and it takes ~10s.
 */
app.get('/api/audit', async (_req, res) => {
  try {
    res.json(await auditTarget({ budgets: 2500 }))
  } catch (err) {
    console.error('[audit] failed:', err)
    res.status(500).json({ error: 'The audit failed to complete.', kind: 'internal' })
  }
})

/**
 * The audit's findings as a runnable test file.
 *
 * The artifact a reviewer can take away and execute themselves: a standard
 * `node:test` suite with no dependency beyond Node, written against the FIXED
 * behaviour so it fails against the vulnerable version. Generated from the same
 * audit report the panel renders, so the download cannot disagree with the
 * screen.
 */
app.get('/api/audit/regression-test', async (_req, res) => {
  try {
    const report = await auditTarget({ budgets: 2500 })
    res.json({ ...buildRegressionTest(report), target: report.target })
  } catch (err) {
    console.error('[audit/regression-test] failed:', err)
    res.status(500).json({ error: 'The regression test could not be generated.', kind: 'internal' })
  }
})

app.post('/api/analyze', rateLimit, async (req, res) => {
  const controller = new AbortController()
  req.on('close', () => controller.abort())

  try {
    const report = await analyze(req.body ?? {}, { signal: controller.signal })
    // Encoded here, at the single point where a report becomes bytes, so no
    // field can bypass it. Infinity/NaN would otherwise reach the client as
    // null and read as "returned null / correct answer null".
    res.json(toJsonSafe(report))
  } catch (err) {
    if (err instanceof AnalysisError) {
      return res.status(400).json({ error: err.message, kind: 'analysis' })
    }
    if (controller.signal.aborted) {
      return
    }
    console.error('[analyze] unexpected failure:', err)
    res.status(500).json({
      error: 'The analysis failed unexpectedly. Try a smaller or simpler function.',
      kind: 'internal',
    })
  }
})

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '..', 'dist')
  app.use(express.static(dist, { maxAge: '1h' }))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  const llm = getLlmConfig()
  console.log(`counterexample api listening on :${port}  (llm: ${llm?.name ?? 'none, heuristics only'})`)
})