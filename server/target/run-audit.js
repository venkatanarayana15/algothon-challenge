/**
 * Run the ALG-CYBER-02 audit and print it as a judge reads it.
 *
 *   npm run audit
 *
 * The same thing `GET /api/audit` does, as a terminal report. Useful in CI, and
 * useful when you want the whole workflow on screen while you talk through it
 * rather than clicking through a browser.
 */

import { auditTarget } from './audit.js'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const OFF = '\x1b[0m'

const report = await auditTarget({ budgets: 2500 })

console.log(`\n${BOLD}Security audit${OFF} ${DIM}${report.target}${OFF}\n`)

for (const v of report.vulnerabilities) {
  console.log(`${BOLD}${v.id}${OFF}  ${v.title}`)
  console.log(`     ${DIM}${v.owasp} · in ${v.subject}()${OFF}`)
  console.log(
    `     found by   ${v.detectedByEngine ? `${GREEN}the engine, automatically${OFF}` : `${DIM}a supplied attack case${OFF}`}`,
  )
  if (v.detectedByEngine) {
    console.log(`                ${DIM}${v.detection.call}${OFF}`)
  }
  console.log(`     attack     ${v.attack.call}`)
  console.log(`       before   ${RED}${v.attack.before}${OFF}`)
  console.log(`       after    ${GREEN}${v.attack.after}${OFF}`)
  if (v.attack.note) console.log(`                ${DIM}${v.attack.note}${OFF}`)
  console.log(`     root cause ${v.rootCause}`)
  console.log(`     fix        ${v.fix}`)
  console.log(
    `     retest     ${v.legitimateChecks.passed}/${v.legitimateChecks.total} legitimate cases still behave correctly`,
  )
  const ok = v.status === 'FIXED_AND_VERIFIED'
  console.log(
    `     ${ok ? `${GREEN}FIXED AND VERIFIED${OFF}` : `${RED}INCOMPLETE${OFF}`}\n`,
  )
}

const r = report.regression
console.log(`${BOLD}Regression${OFF}`)
console.log(`  legitimate cases        ${r.passedAfterFix}/${r.legitimateChecks} pass after the fixes`)
console.log(`  were passing before     ${r.passedBeforeFix}/${r.legitimateChecks}`)
console.log(`  broken by the fixes     ${r.brokenByFix.length === 0 ? `${GREEN}none${OFF}` : RED + JSON.stringify(r.brokenByFix) + OFF}`)
console.log(
  `  functionality preserved ${r.functionalityPreserved ? `${GREEN}yes${OFF}` : `${RED}no${OFF}`}\n`,
)

process.exitCode = report.vulnerabilities.every((v) => v.status === 'FIXED_AND_VERIFIED') && r.functionalityPreserved ? 0 : 1