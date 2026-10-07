import type { StoryEstimate } from "../platforms/interfaces/work-item.interface";
import type { EstimationConversion } from "../templates/schema";
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
