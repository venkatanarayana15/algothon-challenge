import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze } from './engine/analysis.js'
import { AnalysisError } from './engine/analyze.js'
import { getLlmConfig } from './engine/llm.js'
import { toJsonSafe } from './engine/json-safe.js'
import { EXAMPLES } from './examples.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

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
  res.json({ examples: EXAMPLES })
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