import type { EstimationDefaults } from "../platforms/interfaces/estimation-defaults.interface";
import type { StoryEstimate, WorkItem } from "../platforms/interfaces/work-item.interface";

/** Template-level overrides of a platform's default Estimation Field Mapping. */
export interface EstimationFieldOverrides {
  source?: string;
  taskType?: string;
  targetFields?: readonly string[];
}

export type StoryEstimateSource =
  | { kind: "default"; fields: readonly string[] }
  | { kind: "override"; field: string };

export type TaskEstimateTarget =
  | { kind: "default"; fields: readonly string[] }
  | { kind: "override"; fields: readonly string[] };

export interface EstimationFieldMapping {
  storySource: StoryEstimateSource;
  taskWorkItemType: string;
  taskTarget: TaskEstimateTarget;
  /** Present only when the Task Estimate goes to the adapter's default fields, whose unit it knows. */
  unitLabel?: string;
}

export function resolveEstimationFieldMapping(
  defaults: EstimationDefaults,
  overrides: EstimationFieldOverrides = {},
): EstimationFieldMapping {
  const storySource: StoryEstimateSource = overrides.source
    ? { kind: "override", field: overrides.source }
    : { kind: "default", fields: defaults.storyEstimateFields };

  const taskTarget: TaskEstimateTarget = overrides.targetFields?.length
    ? { kind: "override", fields: [...overrides.targetFields] }
    : { kind: "default", fields: defaults.taskEstimateFields };

  return {
    storySource,
    taskWorkItemType: overrides.taskType ?? defaults.taskWorkItemType,
    taskTarget,
    unitLabel: taskTarget.kind === "default" ? defaults.unitLabel : undefined,
  };
}

/**
 * Reads the raw Story Estimate. Default sources rely on the adapter having already
 * applied its own fallback chain to `story.estimation`; an override is one field with
 * no fallback, so a blank override never borrows a value in a different unit.
 */
export function readStoryEstimate(
  story: WorkItem,
  source: StoryEstimateSource,
): StoryEstimate | undefined {
  const value =
    source.kind === "default" ? story.estimation : story.customFields?.[source.field];
  return isStoryEstimate(value) ? value : undefined;
}

/** Numeric value of a Story Estimate, or undefined when it is missing or non-numeric. */
export function numericStoryEstimate(value: StoryEstimate | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isStoryEstimate(value: unknown): value is StoryEstimate {
  return (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.trim() !== "");
}
