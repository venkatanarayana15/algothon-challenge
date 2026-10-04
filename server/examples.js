/**
 * Seeded gallery.
 *
 * Every entry here has been verified: Counterexample finds a specific, minimal
 * counterexample against it. The gallery is the demo -- a judge who lands on the
 * site sees a real failure in under a second without typing anything, and every
 * claim we make in the README is reproducible from this list.
 *
 * `oracleSignature` points at the pre-written reference implementations in
 * `engine/oracles.js`, so these run with no network and no API key.
 */

export const EXAMPLES = [
  {
    id: 'fib-missing-base-case',
    title: 'Fibonacci with a missing base case',
    difficulty: 'easy',
    language: 'JavaScript',
    oracleSignature: 'fib:number',
    spec: 'Return the nth Fibonacci number, where fib(0) = 0 and fib(1) = 1.',
    tags: ['recursion', 'base case', 'infinite loop'],
    bugClass: 'Recursion without a complete base case',
    code: `// fib(n) returns the nth Fibonacci number.
function fib(n) {
  if (n === 0) return 0;
  return fib(n - 1) + fib(n - 2);
}`,
    counterexample: `fib(-1)`,
    rootCause:
      'The guard only covers n === 0. For n = 1 the function evaluates fib(-1), which is not covered, so recursion never terminates.',
    fix: `if (n <= 1) return n;`,
  },
  {
    id: 'prime-negative',
    title: 'Primality check that trusts its input',
    difficulty: 'easy',
    language: 'JavaScript',
    oracleSignature: 'isPrime:number',
    spec: 'Return true if n is a prime number, false otherwise.',
    tags: ['boundaries', 'guard clause'],
    bugClass: 'Incorrect boundary condition',
    code: `// isPrime(n) -> boolean
function isPrime(n) {
  if (n < 2) return true;
  if (n < 4) return true;
  if (n % 2 === 0) return false;
  for (let d = 3; d * d <= n; d += 2) {
    if (n % d === 0) return false;
  }
  return true;
}`,
    counterexample: `isPrime(-1)`,
    rootCause:
      'The early return for n < 2 returns true instead of false, so every value below 2 is reported as prime.',
    fix: `if (n < 2) return false;`,
  },
  {
    id: 'gcd-negative-args',
    title: 'GCD that cannot handle negative numbers',
    difficulty: 'medium',
    language: 'JavaScript',
    oracleSignature: 'gcd:number,number',
    spec: 'Return the greatest common divisor of two integers as a non-negative number.',
    tags: ['negatives', 'sign handling'],
    bugClass: 'Unhandled input domain',
    code: `// gcd(a, b) -> number
function gcd(a, b) {
  while (b > 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}`,
    counterexample: `gcd(-1, 0)`,
    rootCause:
      'The loop condition requires b > 0, so a negative b exits immediately and the function returns a instead of the true gcd.',
    fix: `a = Math.abs(a); b = Math.abs(b); while (b) { ... }`,
  },
  {
    id: 'sum-empty-array',
    title: 'Sum that starts from the first element',
    difficulty: 'easy',
    language: 'JavaScript',
    oracleSignature: 'sum:number[]',
    spec: 'Return the sum of all numbers in the array. The sum of an empty array is 0.',
    tags: ['empty input', 'initial value'],
    bugClass: 'Initial value taken from user input',
    code: `// sum(nums) -> number
function sum(nums) {
  let total = nums[0];
  for (let i = 1; i < nums.length; i++) {
    total += nums[i];
  }
  return total;
}`,
    counterexample: `sum([])`,
    rootCause:
      'The accumulator is seeded with nums[0] rather than 0, so an empty array yields undefined instead of 0.',
    fix: `let total = 0;`,
  },
  {
    id: 'max-empty-array',
    title: 'Maximum of an array, uninitialised',
    difficulty: 'easy',
    language: 'JavaScript',
    oracleSignature: 'max:number[]',
    spec: 'Return the largest number in the array.',
    tags: ['empty input', 'NaN'],
    bugClass: 'Uninitialised sentinel',
    code: `// max(nums) -> number
function max(nums) {
  let best = -Infinity;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] > best) best = nums[i];
  }
  return best;
}`,
    counterexample: `max([])`,
    rootCause:
      '-Infinity is a sentinel for "no value yet", but it leaks out as the return value for an empty array.',
    fix: 'Return undefined when the array is empty, or document that the input must be non-empty.',
  },
  {
    id: 'second-largest-duplicates',
    title: 'Second largest that ignores duplicates',
    difficulty: 'medium',
    language: 'JavaScript',
    oracleSignature: 'secondLargest:number[]',
    spec: 'Return the second largest distinct number in the array, or null if there is none.',
    tags: ['duplicates', 'all-equal input'],
    bugClass: 'Missing distinctness constraint',
    code: `// secondLargest(nums) -> number | null
function secondLargest(nums) {
  let first = -Infinity;
  let second = -Infinity;
  for (let i = 0; i < nums.length; i++) {
    const v = nums[i];
    if (v > first) { second = first; first = v; }
    else if (v > second) { second = v; }
  }
  return second === -Infinity ? null : second;
}`,
    counterexample: `secondLargest([Infinity, Infinity])`,
    rootCause:
      'The else-branch accepts equal values, so a repeated maximum is reported as its own second largest.',
    fix: 'Require v < first in the else-branch.',
  },
  {
    id: 'reverse-drops-last',
    title: 'String reverse that drops the last character',
    difficulty: 'easy',
    language: 'JavaScript',
    oracleSignature: 'reverse:string',
    spec: 'Return the input string with its characters in reverse order.',
    tags: ['off-by-one', 'loop bound'],
    bugClass: 'Off-by-one loop bound',
    code: `// reverseString(s) -> string
function reverseString(s) {
  let out = '';
  for (let i = 0; i < s.length - 1; i++) {
    out = s[i] + out;
  }
  return out;
}`,
    counterexample: `reverseString("u")`,
    rootCause:
      'The loop stops one character early, so the final character is never copied. The bug is invisible for empty strings.',
    fix: 'for (let i = 0; i < s.length; i++)',
  },
  {
    id: 'vowels-off-by-one',
    title: 'Vowel counter with a shifted index',
    difficulty: 'easy',
    language: 'JavaScript',
    oracleSignature: 'countVowels:string',
    spec: 'Count the vowels (a, e, i, o, u) in a string, case-insensitively.',
    tags: ['off-by-one', 'first element skipped'],
    bugClass: 'Off-by-one loop bound',
    code: `// countVowels(s) -> number
function countVowels(s) {
  let n = 0;
  for (let i = 1; i <= s.length; i++) {
    const c = s[i].toLowerCase();
    if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') n++;
  }
  return n;
}`,
    counterexample: `countVowels(" ")`,
    rootCause:
      'Starting at index 1 skips the first character, and reading s[s.length] produces undefined, so .toLowerCase() throws.',
    fix: 'for (let i = 0; i < s.length; i++)',
  },
  {
    id: 'rotate-negative-k',
    title: 'Array rotation with a naive modulo',
    difficulty: 'medium',
    language: 'JavaScript',
    oracleSignature: 'rotate:number[],number',
    spec: 'Rotate an array to the right by k positions. A negative k rotates to the left. Return a new array.',
    tags: ['negatives', 'modulo'],
    bugClass: 'Modulo on negative operands',
    code: `// rotateRight(nums, k) -> number[]
function rotateRight(nums, k) {
  if (nums.length === 0) return [];
  const r = k % nums.length;
  return nums.slice(nums.length - r).concat(nums.slice(0, nums.length - r));
}`,
    counterexample: `rotateRight([1, 0], -1)`,
    rootCause:
      'In JavaScript -1 % 3 is -1, not 2, so slice receives a negative index and the rotation goes the wrong way.',
    fix: 'const r = ((k % nums.length) + nums.length) % nums.length;',
  },
  {
    id: 'sorted-wrong-direction',
    title: 'Sorted check with an inverted comparison',
    difficulty: 'medium',
    language: 'JavaScript',
    oracleSignature: 'sorted:boolean',
    spec: 'Return true if the numbers are in non-decreasing order.',
    tags: ['comparison', 'inverted logic'],
    bugClass: 'Inverted predicate',
    code: `// isSorted(nums) -> boolean
function isSorted(nums) {
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] > nums[i - 1]) return false;
  }
  return true;
}`,
    counterexample: `isSorted([1, 0])`,
    rootCause:
      'The predicate marks any increase as unsorted. It returns true only for arrays that are already decreasing.',
    fix: 'if (nums[i] < nums[i - 1]) return false;',
  },
  {
    id: 'dedupe-loses-order',
    title: 'Deduplication that reorders the result',
    difficulty: 'medium',
    language: 'JavaScript',
    oracleSignature: 'removeDuplicates:number[]',
    spec: 'Remove duplicate values, keeping the first occurrence of each and preserving the original order.',
    tags: ['order preservation', 'Set'],
    bugClass: 'Ordering contract violated',
    code: `// removeDuplicates(nums) -> number[]
function removeDuplicates(nums) {
  return [...new Set(nums)].sort((a, b) => a - b);
}`,
    counterexample: `removeDuplicates([1, 0])`,
    rootCause:
      'A Set preserves insertion order, but the trailing sort discards it. The result is correct as a multiset and wrong as a sequence.',
    fix: 'return [...new Set(nums)];',
  },
  {
    id: 'binarysearch-off-by-one',
    title: 'Binary search that returns the wrong index',
    difficulty: 'hard',
    language: 'JavaScript',
    oracleSignature: 'binarySearch:number[],number',
    spec: 'Return the index of the first occurrence of target in nums, or -1 if it is absent.',
    tags: ['off-by-one', 'index arithmetic'],
    bugClass: 'Off-by-one in returned index',
    code: `// binarySearch(nums, target) -> number
function binarySearch(nums, target) {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (nums[mid] === target) return mid + 1;
    if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`,
    counterexample: `binarySearch([1], 1)`,
    rootCause:
      'The match branch returns mid + 1, shifting every hit one position to the right. It still returns -1 correctly for misses, which is why tests rarely catch it.',
    fix: 'return mid;',
  },
]

/**
 * Security validators.
 *
 * These are the ALG-CYBER-02 cases, and they behave differently from everything
 * above: a validator has no right answer to compare against, only a rule. So
 * they are held to a policy derived from their own comparisons rather than to a
 * reference implementation, and the finding is a *bypass* -- an input the rule
 * forbids that the check let through.
 *
 * `oracleSignature` is empty on purpose. Leaving it blank is what lets the
 * engine recognise the validator from its shape; naming a value oracle here
 * would compare a range check against `isPrime` and report nonsense.
 */
export const SECURITY_EXAMPLES = [
  {
    id: 'validate-qty-nan-bypass',
    title: 'Quantity check that NaN walks straight through',
    difficulty: 'easy',
    language: 'JavaScript',
    oracleSignature: '',
    spec: 'Accept a quantity only if it is a whole number from 1 to 100. Return null when accepted, otherwise an error message.',
    tags: ['security', 'validation bypass', 'NaN', 'OWASP A03'],
    bugClass: 'Missing type and finiteness guard',
    code: `// POST /cart/items  ->  null | error string
function validateQty(q) {
  if (q <= 0) return 'must be positive';
  if (q > 100) return 'too many';
  return null;
}`,
    counterexample: `validateQty(NaN)`,
    rootCause:
      'Every comparison with NaN is false, so both guards fall through and the function returns null — meaning accepted. A range check written this way rejects -1 and 1e9 while waving through NaN, which then flows into arithmetic and poisons the total.',
    fix: 'Reject non-numbers before the range test: `if (typeof q !== "number" || !Number.isFinite(q)) return "not a number";`',
  },
  {
    id: 'validate-age-nan-bypass',
    title: 'Age gate that Infinity and "25" both pass',
    difficulty: 'medium',
    language: 'JavaScript',
    oracleSignature: '',
    spec: 'Accept an age only if it is a whole number from 0 to 120. Return null when accepted, otherwise an error message.',
    tags: ['security', 'validation bypass', 'type confusion', 'OWASP A03'],
    bugClass: 'Missing type guard',
    code: `// signup  ->  null | error string
function validateAge(age) {
  if (age < 0) return 'age cannot be negative';
  if (age > 120) return 'implausible age';
  return null;
}`,
    counterexample: `validateAge(NaN)`,
    rootCause:
      'The string "25" also passes, because JavaScript coerces it for both comparisons. The check constrains a range without ever establishing that it was given a number, so non-numeric values are coerced into looking valid.',
    fix: 'Establish the type first: `if (typeof age !== "number" || !Number.isFinite(age)) return "not a number";`',
  },
  {
    id: 'validate-port-range-bypass',
    title: 'Port validator with no upper bound for non-numbers',
    difficulty: 'medium',
    language: 'JavaScript',
    oracleSignature: '',
    spec: 'Accept a port only if it is a whole number from 1 to 65535. Return null when accepted, otherwise an error message.',
    tags: ['security', 'validation bypass', 'NaN', 'input validation'],
    bugClass: 'Missing finiteness guard',
    code: `// service config  ->  null | error string
function validatePort(port) {
  if (port < 1) return 'port must be positive';
  if (port > 65535) return 'port out of range';
  return null;
}`,
    counterexample: `validatePort(NaN)`,
    rootCause:
      'The bounds are right, so this reads as correct on inspection. But NaN satisfies neither comparison, so an undefined port reaches the client as an accepted value and the failure surfaces later, somewhere unrelated.',
    fix: 'Reject NaN explicitly: `if (!Number.isFinite(port)) return "not a number";`',
  },
]

/**
 * The provenance case: a faithful reproduction of a class of bug that shipped
 * and survived review because the failing input was never written down.
 * No proprietary source is quoted -- the shape is the point.
 */
export const PROVENANCE_CASE = {
  id: 'off-by-one-shipped',
  title: 'Off-by-one that passed review and reached production',
  difficulty: 'hard',
  language: 'JavaScript',
  oracleSignature: 'binarySearch:number[],number',
  spec: 'Return the index of the target in a sorted array, or -1 if it is absent.',
  tags: ['off-by-one', 'real-world shape', 'code review'],
  bugClass: 'Off-by-one in index arithmetic',
  code: `// A real shape of bug: index shifted by one when a match is found.
// It survives code review because the happy-path tests pass and the
// failure mode is invisible on the first element of the array.
function indexOfTarget(nums, target) {
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === target) return i;
  }
  if (nums[0] === target) return 0;
  return -1;
}`,
  counterexample: `indexOfTarget([1, 1], 1)`,
  rootCause:
    'The loop starts at index 1 and the array is scanned before index 0 is checked, so the first element is only handled by a special case that runs last. This is the shape of bug that code review does not catch: every individual line is defensible.',
  fix: 'Scan from index 0 and drop the special case.',
}