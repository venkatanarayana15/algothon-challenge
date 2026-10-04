/**
 * Guidance shown next to each detected bug class.
 *
 * Mirrors `CLASS_ADVICE` in the engine, kept as a separate copy so the advice
 * can be reworded for a human without touching the classification logic.
 */
export const CLASS_ADVICE: Record<string, string> = {
  // The security case, and the only class where the wrong answer is worse than
  // a wrong result: the input was never supposed to reach the rest of the
  // program at all. The engine sends its own class-specific advice for this
  // one; this entry is the fallback when it does not.
  'validation-bypass':
    'Check the type and finiteness of every field before the range test. Comparisons are false against true, null, "" and NaN, so a range check written with comparisons alone accepts all four.',
  'off-by-one': 'Audit every loop bound and index arithmetic. One comparison is one element too few.',
  'empty-input': 'Decide explicitly what the function returns for an empty collection, before indexing into it.',
  'missing-base-case': 'Check that the recursion guard covers every valid input, including the smallest one.',
  'wrong-comparison': 'Verify the direction of each comparison against the stated intent, not against habit.',
  'non-finite': 'Reject or handle NaN and Infinity before they enter arithmetic or comparisons.',
  'non-termination': 'Bound the loop or iteration explicitly rather than relying on the shape of the input.',
  'empty-sentinel': 'Do not use a sentinel initial value as a return value. Branch on the empty case.',
  'duplicates-ignored': 'State whether duplicates are meaningful, then encode that in the invariant.',
  'ordering-contract': 'If output order is part of the contract, do not sort as a side effect.',
  'negative-domain': 'Normalise the sign at the boundary, before any comparison or modulo.',
  'modulo-sign': 'Normalise modulo as ((k % n) + n) % n. JavaScript keeps the sign of the dividend.',
  'non-determinism': 'Remove hidden state: Math.random, Date.now, and mutation of shared arrays.',
}