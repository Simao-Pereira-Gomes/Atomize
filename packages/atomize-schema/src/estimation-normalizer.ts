export interface EstimationPercentage {
  estimationPercent?: number;
}

export interface NormalizationOptions {
  skipIfAlreadyNormalized?: boolean;
  tolerance?: number;
  targetTotal?: number;
}

/** Normalizes estimation percentages to an exact caller-specified total (100 by default). */
export function normalizeEstimationPercentages<T extends EstimationPercentage>(
  items: T[],
  options: NormalizationOptions = {},
): boolean {
  const { skipIfAlreadyNormalized = true, tolerance = 0.01, targetTotal = 100 } = options;
  if (items.length === 0) return false;
  if (items.length === 1) { items[0]!.estimationPercent = targetTotal; return true; }

  const total = items.reduce((sum, item) => sum + (item.estimationPercent || 0), 0);
  if (skipIfAlreadyNormalized && Math.abs(total - targetTotal) < tolerance) return false;
  if (skipIfAlreadyNormalized && total > targetTotal) return false;

  if (total === 0 || Number.isNaN(total)) {
    const base = Math.floor(targetTotal / items.length);
    const remainder = targetTotal - base * items.length;
    items.forEach((item, index) => { item.estimationPercent = index === 0 ? base + remainder : base; });
    return true;
  }

  const scale = targetTotal / total;
  let sum = 0;
  items.forEach((item, index) => {
    if (index === items.length - 1) item.estimationPercent = targetTotal - sum;
    else { const scaled = Math.round((item.estimationPercent || 0) * scale); item.estimationPercent = scaled; sum += scaled; }
  });
  return true;
}
