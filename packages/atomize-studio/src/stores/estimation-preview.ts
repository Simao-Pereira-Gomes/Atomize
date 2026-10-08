import { type EstimationConfig, lookupTableEstimate } from "@sppg2001/atomize-schema";

export type PreviewTask = { title: string; percent: number };

export type EstimationPreview =
  | { kind: "estimated"; total: number; usedDefault: boolean; tasks: Array<PreviewTask & { hours: number }> }
  | { kind: "blank"; tasks: PreviewTask[] }
  | { kind: "skipped" };

type PreviewConfig = Partial<
  Pick<EstimationConfig, "conversion" | "rounding" | "minimumTaskEstimate" | "ifParentHasNoEstimation" | "defaultParentEstimation">
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
  return {
    kind: "estimated",
    total: roundedTotal,
    usedDefault,
    tasks: tasks.map((task) => ({
      ...task,
      hours: Math.max(round((roundedTotal * task.percent) / 100, config.rounding ?? "none"), minimum),
    })),
  };
}
