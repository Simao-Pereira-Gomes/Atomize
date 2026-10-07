import type { StoryEstimate } from "../platforms/interfaces/work-item.interface";
import type { EstimationConfig, EstimationConversion } from "../templates/schema";
import { numericStoryEstimate } from "./estimation-field-mapping";

export type StoryEstimateConversion =
  | { kind: "resolved"; total: number }
  | { kind: "unresolvable"; reason: string };

/**
 * Converts a raw Story Estimate into a total in the Task's unit. With no conversion
 * the estimate is used one-to-one, which only works for numeric estimates.
 */
export function convertStoryEstimate(
  raw: StoryEstimate | undefined,
  conversion?: EstimationConversion,
): StoryEstimateConversion {
  if (raw === undefined) {
    return { kind: "unresolvable", reason: "Story has no estimate" };
  }

  const numeric = numericStoryEstimate(raw);
  if (numeric === undefined) {
    return {
      kind: "unresolvable",
      reason: `Story Estimate "${raw}" is not numeric and the Template declares no conversion for it`,
    };
  }

  const factor = conversion?.factor ?? 1;
  return { kind: "resolved", total: roundAwayFloatNoise(numeric * factor) };
}

function roundAwayFloatNoise(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

export type StoryEstimateResolution =
  | { kind: "resolved"; total: number; fallbackReason?: string }
  | { kind: "blank"; reason: string }
  | { kind: "skip"; reason: string };

/**
 * Converts the Story Estimate and applies the Template's `ifParentHasNoEstimation` policy
 * when it cannot be converted. An Unresolvable Story Estimate is never turned into zero.
 */
export function resolveStoryEstimate(
  raw: StoryEstimate | undefined,
  config?: Pick<EstimationConfig, "conversion" | "ifParentHasNoEstimation" | "defaultParentEstimation">,
): StoryEstimateResolution {
  const converted = convertStoryEstimate(raw, config?.conversion);
  if (converted.kind === "resolved") return converted;

  switch (config?.ifParentHasNoEstimation ?? "warn") {
    case "skip":
      return { kind: "skip", reason: converted.reason };
    case "use-default": {
      if (config?.defaultParentEstimation === undefined) {
        return {
          kind: "blank",
          reason: `${converted.reason}, and no defaultParentEstimation is set`,
        };
      }
      const fallback = convertStoryEstimate(config.defaultParentEstimation, config.conversion);
      if (fallback.kind === "resolved") {
        return { kind: "resolved", total: fallback.total, fallbackReason: converted.reason };
      }
      return { kind: "blank", reason: `${converted.reason}, and the default Story Estimate is unusable: ${fallback.reason}` };
    }
    default:
      return { kind: "blank", reason: converted.reason };
  }
}
