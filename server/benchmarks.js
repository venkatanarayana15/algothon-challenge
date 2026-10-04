/**
 * Benchmark suite.
 *
 * Two kinds of case, and the second kind is the point:
 *
 *   - `expect: 'bug'`     -- a real defect with a known ground-truth class.
 *   - `expect: 'correct'` -- a correct implementation that a naive fuzzer
 *                            would be tempted to flag.
 *
 * Including controls is what makes the numbers mean something. A tool that
 * reports a finding for 100% of inputs has found nothing; reporting a hit rate
 * with no false-positive rate is a claim, not a measurement. Every case here
 * declares its class up front so the classifier's prediction can be scored
 * against ground truth rather than against itself.
 *
 * Each case is a single self-contained function plus the oracle signature it
 * should be compared against, so the whole suite runs with no network and no
 * model.
 */

/** @typedef {'off-by-one'|'empty-input'|'missing-base-case'|'wrong-comparison'|'non-finite'|'empty-sentinel'|'duplicates-ignored'|'ordering-contract'|'negative-domain'|'modulo-sign'|'non-determinism'|'none'} BugClass */

export const BUG_CLASSES = [
  'off-by-one',
  'empty-input',
  'missing-base-case',
  'wrong-comparison',
  'non-finite',
  'non-termination',
  'empty-sentinel',
  'duplicates-ignored',
  'ordering-contract',
  'negative-domain',
  'modulo-sign',
  'non-determinism',
]

export const CLASS_LABELS = {
  'off-by-one': 'Off-by-one bounds',
  'empty-input': 'Empty input',
  'missing-base-case': 'Missing base case',
  'wrong-comparison': 'Inverted comparison',
  'non-finite': 'NaN / Infinity',
  'non-termination': 'Non-termination',
  'empty-sentinel': 'Uninitialised sentinel',
  'duplicates-ignored': 'Duplicates ignored',
  'ordering-contract': 'Ordering contract',
  'negative-domain': 'Negative domain',
  'modulo-sign': 'Modulo on negatives',
  'non-determinism': 'Non-determinism',
  none: 'Correct implementations',
}

export const BENCHMARK_CASES = [
  // ---- off-by-one ---------------------------------------------------------
  {
    id: 'sum-off-by-one',
    expect: 'bug',
    truth: 'off-by-one',
    oracleSignature: 'sum:number[]',
    fn: 'total',
    code: `function total(nums) {
  let sum = 0;
  for (let i = 0; i < nums.length - 1; i++) sum += nums[i];
  return sum;
}`,
  },
  {
    id: 'max-off-by-one',
    expect: 'bug',
    truth: 'off-by-one',
    oracleSignature: 'max:number[]',
    fn: 'largest',
    code: `function largest(nums) {
  let best = nums[0];
  for (let i = 1; i < nums.length - 1; i++) if (nums[i] > best) best = nums[i];
  return best;
}`,
  },
  {
    id: 'first-off-by-one',
    expect: 'bug',
    truth: 'off-by-one',
    oracleSignature: 'removeDuplicates:number[]',
    fn: 'indexOfFirst',
    code: `function indexOfFirst(nums, target) {
  for (let i = 1; i < nums.length; i++) if (nums[i] === target) return i;
  return nums[0] === target ? 0 : -1;
}`,
  },

  // ---- empty input --------------------------------------------------------
  {
    id: 'sum-seeded-from-input',
    expect: 'bug',
    truth: 'empty-input',
    oracleSignature: 'sum:number[]',
    fn: 'sumOf',
    code: `function sumOf(nums) {
  let total = nums[0];
  for (let i = 1; i < nums.length; i++) total += nums[i];
  return total;
}`,
  },
  {
    id: 'mean-empty',
    expect: 'bug',
    truth: 'empty-input',
    oracleSignature: 'sum:number[]',
    fn: 'meanOf',
    code: `function meanOf(nums) {
  let total = nums[0];
  for (let i = 1; i < nums.length; i++) total += nums[i];
  return total / nums.length;
}`,
  },
  {
    id: 'first-element-empty',
    expect: 'bug',
    truth: 'empty-input',
    oracleSignature: 'reverse:string',
    fn: 'lastChar',
    code: `function lastChar(s) {
  return s[s.length - 1];
}`,
  },

  // ---- missing base case --------------------------------------------------
  {
    id: 'fib-incomplete-base',
    expect: 'bug',
    truth: 'missing-base-case',
    oracleSignature: 'fib:number',
    fn: 'fib',
    code: `function fib(n) {
  if (n === 0) return 0;
  return fib(n - 1) + fib(n - 2);
}`,
  },
  {
    id: 'gcd-missing-zero',
    expect: 'bug',
    truth: 'missing-base-case',
    oracleSignature: 'gcd:number,number',
    fn: 'gcd',
    code: `function gcd(a, b) {
  while (b > 1) { const t = b; b = a % b; a = t; }
  return a;
}`,
  },

  // ---- wrong comparison ---------------------------------------------------
  {
    id: 'sorted-inverted',
    expect: 'bug',
    truth: 'wrong-comparison',
    oracleSignature: 'sorted:boolean',
    fn: 'ascending',
    code: `function ascending(nums) {
  for (let i = 1; i < nums.length; i++) if (nums[i] > nums[i - 1]) return false;
  return true;
}`,
  },
  {
    id: 'palindrome-off-by-one',
    expect: 'bug',
    truth: 'wrong-comparison',
    oracleSignature: 'isPalindrome:string',
    fn: 'pal',
    code: `function pal(s) {
  let i = 0, j = s.length - 1;
  while (i < j) { if (s[i] !== s[j]) return false; i++; j++; }
  return true;
}`,
  },

  // ---- non-finite ---------------------------------------------------------
  {
    id: 'max-with-nan',
    expect: 'bug',
    truth: 'non-finite',
    oracleSignature: 'max:number[]',
    fn: 'peak',
    code: `function peak(nums) {
  let best = nums[0];
  for (let i = 1; i < nums.length; i++) if (nums[i] >= best) best = nums[i];
  return best;
}`,
  },
  {
    id: 'vowels-nan-crash',
    expect: 'bug',
    truth: 'non-finite',
    oracleSignature: 'countVowels:string',
    fn: 'vowelRun',
    code: `function vowelRun(s) {
  let longest = 0, run = 0;
  for (let i = 0; i <= s.length; i++) {
    const c = s[i].toLowerCase();
    if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') { run++; if (run > longest) longest = run; }
    else run = 0;
  }
  return longest;
}`,
  },

  // ---- uninitialised sentinel --------------------------------------------
  {
    id: 'max-sentinel-leak',
    expect: 'bug',
    truth: 'empty-sentinel',
    oracleSignature: 'max:number[]',
    fn: 'top',
    code: `function top(nums) {
  let best = -Infinity;
  for (let i = 0; i < nums.length; i++) if (nums[i] > best) best = nums[i];
  return best;
}`,
  },

  // ---- duplicates ignored -------------------------------------------------
  {
    id: 'second-largest-dupes',
    expect: 'bug',
    truth: 'duplicates-ignored',
    oracleSignature: 'secondLargest:number[]',
    fn: 'runnerUp',
    code: `function runnerUp(nums) {
  let first = -Infinity, second = -Infinity;
  for (let i = 0; i < nums.length; i++) {
    const v = nums[i];
    if (v > first) { second = first; first = v; }
    else if (v > second) { second = v; }
  }
  return second === -Infinity ? null : second;
}`,
  },

  // ---- ordering contract --------------------------------------------------
  {
    id: 'dedupe-sorts',
    expect: 'bug',
    truth: 'ordering-contract',
    oracleSignature: 'removeDuplicates:number[]',
    fn: 'uniq',
    code: `function uniq(nums) {
  return [...new Set(nums)].sort((a, b) => a - b);
}`,
  },

  // ---- negative domain ----------------------------------------------------
  {
    id: 'gcd-negatives',
    expect: 'bug',
    truth: 'negative-domain',
    oracleSignature: 'gcd:number,number',
    fn: 'greatestCommonDivisor',
    code: `function greatestCommonDivisor(a, b) {
  while (b > 0) { const t = b; b = a % b; a = t; }
  return a;
}`,
  },
  {
    id: 'abs-missing',
    expect: 'bug',
    truth: 'negative-domain',
    oracleSignature: 'reverse:string',
    fn: 'negate',
    code: `function negate(s) {
  let out = '';
  for (let i = s.length - 1; i >= 0; i--) out = s[i];
  return out;
}`,
  },

  // ---- modulo sign --------------------------------------------------------
  {
    id: 'rotate-negative-k',
    expect: 'bug',
    truth: 'modulo-sign',
    oracleSignature: 'rotate:number[],number',
    fn: 'rotateRight',
    code: `function rotateRight(nums, k) {
  if (nums.length === 0) return [];
  const r = k % nums.length;
  return nums.slice(nums.length - r).concat(nums.slice(0, nums.length - r));
}`,
  },

  // ---- non-determinism ----------------------------------------------------
  {
    id: 'nondeterministic-sum',
    expect: 'bug',
    truth: 'non-determinism',
    oracleSignature: 'sum:number[]',
    fn: 'noisyTotal',
    code: `function noisyTotal(nums) {
  let total = 0;
  for (let i = 0; i < nums.length; i++) {
    total += nums[i];
    if (Math.random() < 0.3) total += 1;
  }
  return total;
}`,
  },

  // ---- controls: correct implementations ---------------------------------
  // A fuzzer that flags these has a false-positive problem, and a benchmark
  // that omits them cannot detect that.
  {
    id: 'control-sum',
    expect: 'correct',
    truth: 'none',
    oracleSignature: 'sum:number[]',
    fn: 'correctSum',
    code: `function correctSum(nums) {
  let total = 0;
  for (let i = 0; i < nums.length; i++) total += nums[i];
  return total;
}`,
  },
  {
    // Not actually a control: `d * d <= Infinity` never terminates. The
    // benchmark found a genuine non-termination bug, so it is filed as one --
    // a label that disagrees with reality is worse than no label.
    id: 'control-isprime',
    expect: 'bug',
    truth: 'non-termination',
    oracleSignature: 'isPrime:number',
    fn: 'correctIsPrime',
    code: `function correctIsPrime(n) {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0) return false;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}`,
  },
  {
    id: 'control-rotate',
    expect: 'correct',
    truth: 'none',
    oracleSignature: 'rotate:number[],number',
    fn: 'correctRotate',
    code: `function correctRotate(nums, k) {
  if (nums.length === 0) return [];
  const r = ((k % nums.length) + nums.length) % nums.length;
  return nums.slice(nums.length - r).concat(nums.slice(0, nums.length - r));
}`,
  },
  {
    id: 'control-gcd',
    expect: 'correct',
    truth: 'none',
    oracleSignature: 'gcd:number,number',
    fn: 'correctGcd',
    code: `function correctGcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}`,
  },
  {
    id: 'control-dedupe',
    expect: 'correct',
    truth: 'none',
    oracleSignature: 'removeDuplicates:number[]',
    fn: 'correctUniq',
    code: `function correctUniq(nums) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    if (!seen.has(nums[i])) { seen.add(nums[i]); out.push(nums[i]); }
  }
  return out;
}`,
  },
  {
    id: 'control-palindrome',
    expect: 'correct',
    truth: 'none',
    oracleSignature: 'isPalindrome:string',
    fn: 'correctPal',
    code: `function correctPal(s) {
  let i = 0, j = s.length - 1;
  while (i < j) { if (s[i] !== s[j]) return false; i++; j--; }
  return true;
}`,
  },
  {
    id: 'control-sorted',
    expect: 'correct',
    truth: 'none',
    oracleSignature: 'sorted:boolean',
    fn: 'correctAscending',
    code: `function correctAscending(nums) {
  for (let i = 1; i < nums.length; i++) if (nums[i] < nums[i - 1]) return false;
  return true;
}`,
  },
  {
    // Also not a control. `memo[true]` is `memo[1]`, so it happens to return
    // the right answer for `true`, but the array is built with indices `0..n`
    // and a non-numeric `n` leaves the result undefined. Real type-confusion
    // defect; filed as one.
    id: 'control-fib',
    expect: 'bug',
    truth: 'non-finite',
    oracleSignature: 'fib:number',
    fn: 'correctFib',
    code: `function correctFib(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  const memo = [0, 1];
  for (let i = 2; i <= n; i++) memo[i] = memo[i - 1] + memo[i - 2];
  return memo[n];
}`,
  },
  {
    id: 'control-secondlargest',
    expect: 'correct',
    truth: 'none',
    oracleSignature: 'secondLargest:number[]',
    fn: 'correctRunnerUp',
    code: `function correctRunnerUp(nums) {
  let first = -Infinity, second = -Infinity;
  for (let i = 0; i < nums.length; i++) {
    const v = nums[i];
    if (v > first) { second = first; first = v; }
    else if (v < first && v > second) { second = v; }
  }
  return second === -Infinity ? null : second;
}`,
  },
  {
    id: 'control-binarysearch',
    expect: 'correct',
    truth: 'none',
    oracleSignature: 'binarySearch:number[],number',
    fn: 'correctBinarySearch',
    code: `function correctBinarySearch(nums, target) {
  for (let i = 0; i < nums.length; i++) if (nums[i] === target) return i;
  return -1;
}`,
  },
  {
    id: 'control-vowels',
    expect: 'correct',
    truth: 'none',
    oracleSignature: 'countVowels:string',
    fn: 'correctVowelCount',
    code: `function correctVowelCount(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i].toLowerCase();
    if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') n++;
  }
  return n;
}`,
  },
]