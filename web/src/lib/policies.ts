/**
 * Validation rules a user can hold a validator to.
 *
 * Mirrors `POLICY_PRESETS` in `server/engine/oracles.js`. Kept here rather than
 * fetched because the set is small, fixed, and part of the product's vocabulary
 * -- the same numbers have to appear in the picker and in the explanation the
 * engine writes, or the two would quietly disagree.
 *
 * All of these are optional. The engine recognises most validators from their
 * own shape and enforces the rule it reads out of the author's comparisons, so
 * picking one is only needed to force a specific range.
 */
export interface PolicyPreset {
  id: string
  label: string
  hint: string
  min: number
  max: number
  integer: boolean
}

export const POLICY_PRESETS: PolicyPreset[] = [
  { id: 'quantity', label: 'Quantity', hint: 'whole number, 1 to 100', min: 1, max: 100, integer: true },
  { id: 'age', label: 'Age', hint: 'whole number, 0 to 120', min: 0, max: 120, integer: true },
  { id: 'percentage', label: 'Percentage', hint: 'number, 0 to 100', min: 0, max: 100, integer: false },
  { id: 'port', label: 'Port', hint: 'whole number, 1 to 65535', min: 1, max: 65535, integer: true },
]

export function findPolicy(id: string): PolicyPreset | undefined {
  return POLICY_PRESETS.find((p) => p.id === id)
}
