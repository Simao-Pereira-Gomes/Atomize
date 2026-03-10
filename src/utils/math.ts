/**
 * Returns `value` if it falls within [min, max], otherwise returns `defaultValue`.
 */
export function clampConcurrency(
  value: number,
  min: number,
  max: number,
  defaultValue: number,
): number {
  if (value < min || value > max) return defaultValue;
  return value;
}
