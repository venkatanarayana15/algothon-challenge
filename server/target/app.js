/**
 * A deliberately vulnerable application, for the tool to audit.
 *
 * This is the ALG-CYBER-02 subject. Everything here is a real bug of a class
 * that ships to production, reproduced at the smallest size that still shows
 * them. Nothing here is a strawman: each one is a line that a reviewer would
 * read and accept.
 *
 * Every function is a *policy decision* -- accept or reject -- rather than a
 * value, because that is what an access-control path actually is. It is also
 * exactly the shape the engine's policy oracle can audit: there is no reference
 * "correct error message for input q", only the rule the author meant to write.
 *
 * Kept free of framework and I/O on purpose. The engine compiles and runs these
 * in a `node:vm` sandbox, so an audit never touches a real server, a real
 * database, or a real request. That is what makes the demonstration safe by
 * construction rather than by promise.
 */

/**
 * V1 -- input validation bypass via NaN.
 *
 * OWASP A03:2021 Injection. Both guards compare against a number, and every
 * comparison with NaN is false, so NaN passes a check that rejects -1 and 1e9.
 * Downstream it flows into arithmetic and poisons the total.
 */
export function validateQty(q) {
  if (q <= 0) return 'quantity must be positive';
  if (q > 100) return 'quantity exceeds maximum';
  return null;
}

/**
 * V2 -- ReDoS. Catastrophic backtracking in an "anchored" password pattern.
 *
 * The `+` inside a lookahead, applied to a long run of the same character,
 * makes the engine try an exponential number of splits before failing. The
 * regex looks defensive -- it is anchored and it is a lookahead -- which is why
 * it survives review. One crafted input saturates a core.
 */
export function isStrongEnoughPassword(pw) {
  if (typeof pw !== 'string') return false;
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(pw)) return false;
  // The classic double-pass. `(?:[a-zA-Z0-9]+\s*)+` is trivially true for any
  // alphanumeric string, so it looks like harmless tidying -- which is exactly
  // why it survives review. It is also a nested quantifier over a single
  // character class, so a long run of one character makes the engine try every
  // way of splitting it before failing.
  if (!/^(?:[a-zA-Z0-9]+\s*)+$/.test(pw)) return false;
  return true;
}

/**
 * V3 -- inverted comparison in an access-control predicate.
 *
 * OWASP A01:2021 Broken Access Control. `level <= 1` was meant to be `>=`. The
 * result is that the lowest-privileged role is the only one that gets in.
 *
 * This is the "authentication / input inspection" half of the PS: the bug is
 * not in parsing an input, it is in the decision the input feeds.
 */
export function authorize(role, level) {
  if (role !== 'user' && role !== 'admin') return 'unknown role';
  if (role === 'admin') return null;
  if (level <= 1) return null; // inverted: should be level >= 1
  return 'insufficient privileges';
}

/**
 * Legitimate application behaviour -- the thing a security fix must not break.
 *
 * These are the happy-path operations a real deployment depends on. They are
 * what the retest suite runs after every fix is applied, because a validator
 * that rejects valid input is not a fix, it is a different outage. This is the
 * requirement the PS states in as many words: security fixes must not break
 * legitimate functionality.
 */
export const LEGITIMATE_CASES = [
  { id: 'qty-valid-low', fn: 'validateQty', args: [1], expectAccept: true, note: 'smallest valid order' },
  { id: 'qty-valid-mid', fn: 'validateQty', args: [42], expectAccept: true, note: 'ordinary order' },
  { id: 'qty-valid-max', fn: 'validateQty', args: [100], expectAccept: true, note: 'largest valid order' },
  { id: 'qty-reject-zero', fn: 'validateQty', args: [0], expectAccept: false, note: 'zero rejected' },
  { id: 'qty-reject-negative', fn: 'validateQty', args: [-5], expectAccept: false, note: 'negative rejected' },
  { id: 'qty-reject-huge', fn: 'validateQty', args: [1000], expectAccept: false, note: 'over max rejected' },

  { id: 'pw-valid-strong', fn: 'isStrongEnoughPassword', args: ['Aa1bcdef'], expectAccept: true, note: 'meets the policy' },
  { id: 'pw-reject-weak', fn: 'isStrongEnoughPassword', args: ['abc'], expectAccept: false, note: 'too weak' },
  { id: 'pw-reject-empty', fn: 'isStrongEnoughPassword', args: [''], expectAccept: false, note: 'empty rejected' },

  { id: 'auth-valid-user', fn: 'authorize', args: ['user', 1], expectAccept: true, note: 'level-1 user allowed' },
  { id: 'auth-valid-admin', fn: 'authorize', args: ['admin', 0], expectAccept: true, note: 'admin always allowed' },
  { id: 'auth-reject-unknown', fn: 'authorize', args: ['ghost', 9], expectAccept: false, note: 'unknown role rejected' },
]

/** The vulnerable source, as one module the engine can compile and audit. */
export const TARGET_SOURCE = `
${validateQty.toString()}

${isStrongEnoughPassword.toString()}

${authorize.toString()}
`

/** How each vulnerability is recognised, and what fixing it means. */
export const VULNERABILITIES = [
  {
    id: 'V1',
    title: 'Quantity check accepts NaN',
    owasp: 'A03:2021 Injection',
    subject: 'validateQty',
    // The engine proves this one by itself: NaN passes both range guards.
    finding: 'validateQty(NaN)',
    rootCause:
      'The function compares a value against numeric bounds without ever checking what type ' +
      'that value is. Every comparison involving NaN evaluates to false, so NaN satisfies neither ' +
      'guard and the function returns null -- which this API defines as "accepted".',
    fix: 'Reject non-numbers and non-finite values before the range test.',
    vulnerable: `function validateQty(q) {
  if (q <= 0) return 'quantity must be positive';
  if (q > 100) return 'quantity exceeds maximum';
  return null;
}`,
    patched: `function validateQty(q) {
  if (typeof q !== 'number' || !Number.isFinite(q)) return 'not a number';
  if (!Number.isInteger(q)) return 'quantity must be a whole number';
  if (q < 1) return 'quantity must be positive';
  if (q > 100) return 'quantity exceeds maximum';
  return null;
}`,
  },
  {
    id: 'V2',
    title: 'Password check is vulnerable to ReDoS',
    owasp: 'A05:2021 Security Misconfiguration / CWE-1333',
    subject: 'isStrongEnoughPassword',
    // Found by the engine's non-termination detection, not by reading the regex.
    finding: 'isStrongEnoughPassword(<long run of one character>)',
    rootCause:
      'The second regex is redundant with the first, so it reads as defensive and survives review. ' +
      'Its nested quantifier -- (?:[a-zA-Z0-9]+\\s*)+ -- backtracks exponentially on a long run ' +
      'of a single character, because the engine tries every way of splitting the run before it ' +
      'can fail. The anchored lookaheads make the whole expression look careful, which is the point.',
    fix: 'Delete the redundant second pattern. One anchored check is both correct and linear.',
    vulnerable: `function isStrongEnoughPassword(pw) {
  if (typeof pw !== 'string') return false;
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$/.test(pw)) return false;
  if (!/^(?:[a-zA-Z0-9]+\\s*)+$/.test(pw)) return false;
  return true;
}`,
    patched: `function isStrongEnoughPassword(pw) {
  if (typeof pw !== 'string') return false;
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$/.test(pw)) return false;
  return true;
}`,
  },
  {
    id: 'V3',
    title: 'Inverted comparison in the access-control check',
    owasp: 'A01:2021 Broken Access Control',
    subject: 'authorize',
    finding: 'authorize("user", 0)',
    rootCause:
      'The guard reads level <= 1 where it means level >= 1. The operator was flipped, and because ' +
      'the predicate is still syntactically sensible and correctly quoted, nothing in review flags ' +
      'it. The effect is an inverted privilege rule: the lowest-privileged caller is admitted and ' +
      'ordinary users are refused.',
    fix: 'Invert the comparison back: require level >= 1.',
    vulnerable: `function authorize(role, level) {
  if (role !== 'user' && role !== 'admin') return 'unknown role';
  if (role === 'admin') return null;
  if (level <= 1) return null;
  return 'insufficient privileges';
}`,
    patched: `function authorize(role, level) {
  if (role !== 'user' && role !== 'admin') return 'unknown role';
  if (role === 'admin') return null;
  if (level >= 1) return null;
  return 'insufficient privileges';
}`,
  },
]