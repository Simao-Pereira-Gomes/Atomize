import { type EstimationConfig, lookupTableEstimate } from "@sppg2001/atomize-schema";

export type PreviewTask = { title: string; percent: number };

export type EstimationPreview =
  | { kind: "estimated"; total: number; usedDefault: boolean; tasks: Array<PreviewTask & { hours: number }> }
  | { kind: "blank"; tasks: PreviewTask[] }
  | { kind: "skipped" };

type PreviewConfig = Partial<
  Pick<
    EstimationConfig,
    "conversion" | "rounding" | "minimumTaskEstimate" | "ifParentHasNoEstimation" | "defaultParentEstimation" | "normalize"
  >
>;

function convert(raw: string, conversion: EstimationConfig["conversion"]): number | undefined {
  const value = raw.trim();
  if (value === "") return undefined;
  if (conversion?.table) return lookupTableEstimate(value, conversion.table, conversion.multipliers);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return numeric * (conversion?.factor ?? 1);
}

// Mirrors the generator's half-hour rounding so the worked example matches generated Tasks.
function round(value: number, rounding: EstimationConfig["rounding"]): number {
  if (rounding === "up") return Math.ceil(value * 2) / 2;
  if (rounding === "down") return Math.floor(value * 2) / 2;
  if (rounding === "nearest") return Math.round(value * 2) / 2;
  return Math.floor(value * 100) / 100;
}

// Mirrors the generator's normalization policy (estimation.normalize) so the example matches generated Tasks.
function normalizedShares(tasks: PreviewTask[], mode: "auto" | "always" | "never"): number[] {
  const total = tasks.reduce((sum, task) => sum + task.percent, 0);
  const scale = total > 0 && ((mode === "auto" && total < 100) || (mode === "always" && total !== 100));
  return tasks.map((task) => (scale ? Math.round((task.percent / total) * 10000) / 100 : task.percent));
}

/** What a Story with the given Story Estimate would produce for these tasks under this configuration. */
export function previewEstimation(sample: string, tasks: PreviewTask[], config: PreviewConfig): EstimationPreview {
  let total = convert(sample, config.conversion);
  let usedDefault = false;
  if (total === undefined) {
    const policy = config.ifParentHasNoEstimation ?? "warn";
    if (policy === "skip") return { kind: "skipped" };
    const fallback =
      policy === "use-default" && config.defaultParentEstimation !== undefined
        ? convert(String(config.defaultParentEstimation), config.conversion)
        : undefined;
    if (fallback === undefined) return { kind: "blank", tasks };
    total = fallback;
    usedDefault = true;
  }
  const minimum = config.minimumTaskEstimate ?? 0;
  const roundedTotal = Math.round(total * 1e9) / 1e9;
  const shares = normalizedShares(tasks, config.normalize ?? "auto");
  return {
    kind: "estimated",
    total: roundedTotal,
    usedDefault,
    tasks: tasks.map((task, index) => ({
      ...task,
      percent: shares[index] ?? task.percent,
      hours: Math.max(round((roundedTotal * (shares[index] ?? task.percent)) / 100, config.rounding ?? "none"), minimum),
    })),
  };
}
