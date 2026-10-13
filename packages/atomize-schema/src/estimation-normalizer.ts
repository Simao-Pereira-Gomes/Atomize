export interface EstimationPercentage {
  estimationPercent?: number;
}

export interface NormalizationOptions {
  skipIfAlreadyNormalized?: boolean;
  tolerance?: number;
  targetTotal?: number;
}

/** Shared by authoring validation and runtime allocation; mutates only the supplied copies. */
export function distributeEstimationPercentages<T extends EstimationPercentage>(
  tasks: T[],
  mode: "auto" | "always" | "never" = "auto",
  forceNormalize = false,
): boolean {
  const total = tasks.reduce((sum, task) => sum + (task.estimationPercent ?? 0), 0);
  const shouldNormalize = mode === "always" ? total !== 100
    : mode === "never" ? false
    : total < 100 || (total > 100 && forceNormalize);
  return shouldNormalize && normalizeEstimationPercentages(tasks, { skipIfAlreadyNormalized: false });
}

export function taskEstimationRangeViolations(
  tasks: ReadonlyArray<EstimationPercentage & { estimationFixed?: number }>,
  range?: { min: number; max: number },
): Array<{ index: number; percent: number; message: string }> {
  if (!range || range.min > range.max) return [];
  return tasks.flatMap((task, index) => {
    const percent = task.estimationPercent;
    if (task.estimationFixed !== undefined || percent === undefined || (percent >= range.min && percent <= range.max)) return [];
    return [{ index, percent, message: `Final task allocation is ${percent}%, but must be between ${range.min}% and ${range.max}%.` }];
  });
}

/** Normalizes estimation percentages to an exact caller-specified total (100 by default). */
export function normalizeEstimationPercentages<T extends EstimationPercentage>(
  items: T[],
  options: NormalizationOptions = {},
): boolean {
  const { skipIfAlreadyNormalized = true, tolerance = 0.01, targetTotal = 100 } = options;
  if (items.length === 0) return false;
  if (items.length === 1) {
    const [first] = items;
    if (first) first.estimationPercent = targetTotal;
    return true;
  }

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
