/**
 * Estimates are scaled and summed as floats, so a total such as 1.2 + 1.2 + 1.2 + 1.2 + 1.2
 * comes out as 5.999999999999999. Every surface shows at most two decimals, rounded, without
 * trailing zeros.
 */
export function formatEstimateValue(value: number): string {
  return String(Math.round(value * 100) / 100);
}
