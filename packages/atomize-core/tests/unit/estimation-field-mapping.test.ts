import { describe, expect, test } from "bun:test";
import {
  numericStoryEstimate,
  readStoryEstimate,
  resolveEstimationFieldMapping,
} from "@sppg2001/atomize-core/core/estimation-field-mapping";
import { AZURE_DEVOPS_ESTIMATION_DEFAULTS } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/estimation-defaults";
import type { EstimationDefaults } from "@sppg2001/atomize-core/platforms/interfaces/estimation-defaults.interface";
import type { WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";

const defaults: EstimationDefaults = {
  storyEstimateFields: ["Points", "Size"],
  taskWorkItemType: "Task",
  taskEstimateFields: ["Remaining", "Original"],
  unitLabel: "hours",
};

function story(overrides: Partial<WorkItem> = {}): WorkItem {
  return { id: "1", title: "S", type: "User Story", state: "New", ...overrides };
}

describe("resolveEstimationFieldMapping", () => {
  test("returns the adapter defaults when the Template overrides nothing", () => {
    expect(resolveEstimationFieldMapping(defaults)).toEqual({
      storySource: { kind: "default", fields: ["Points", "Size"] },
      taskWorkItemType: "Task",
      taskTarget: { kind: "default", fields: ["Remaining", "Original"] },
      unitLabel: "hours",
    });
  });

  test("an overridden source is a single field that replaces the default chain", () => {
    const mapping = resolveEstimationFieldMapping(defaults, { source: "Custom.TShirtSize" });
    expect(mapping.storySource).toEqual({ kind: "override", field: "Custom.TShirtSize" });
    expect(mapping.taskTarget.kind).toBe("default");
  });

  test("an overridden taskType replaces only the child type", () => {
    const mapping = resolveEstimationFieldMapping(defaults, { taskType: "Sub-task" });
    expect(mapping.taskWorkItemType).toBe("Sub-task");
    expect(mapping.storySource.kind).toBe("default");
    expect(mapping.unitLabel).toBe("hours");
  });

  test("overridden targetFields replace the default fields and drop the unit label", () => {
    const mapping = resolveEstimationFieldMapping(defaults, { targetFields: ["Custom.Effort"] });
    expect(mapping.taskTarget).toEqual({ kind: "override", fields: ["Custom.Effort"] });
    expect(mapping.unitLabel).toBeUndefined();
  });

  test("an empty targetFields list keeps the defaults", () => {
    expect(resolveEstimationFieldMapping(defaults, { targetFields: [] }).taskTarget.kind).toBe("default");
  });

  test("Azure DevOps defaults cover Agile, Scrum and CMMI Story fields and the standard Task fields", () => {
    const mapping = resolveEstimationFieldMapping(AZURE_DEVOPS_ESTIMATION_DEFAULTS);
    expect(mapping.storySource).toEqual({
      kind: "default",
      fields: [
        "Microsoft.VSTS.Scheduling.StoryPoints",
        "Microsoft.VSTS.Scheduling.Effort",
        "Microsoft.VSTS.Scheduling.Size",
        "Microsoft.VSTS.Scheduling.OriginalEstimate",
      ],
    });
    expect(mapping.taskWorkItemType).toBe("Task");
    expect(mapping.taskTarget).toEqual({
      kind: "default",
      fields: ["Microsoft.VSTS.Scheduling.RemainingWork", "Microsoft.VSTS.Scheduling.OriginalEstimate"],
    });
  });
});

describe("readStoryEstimate", () => {
  test("a default source reads the estimate the adapter resolved from its chain", () => {
    expect(readStoryEstimate(story({ estimation: 5 }), { kind: "default", fields: [] })).toBe(5);
  });

  test("an override source reads only the named field", () => {
    const s = story({ estimation: 5, customFields: { "Custom.TShirtSize": "L" } });
    expect(readStoryEstimate(s, { kind: "override", field: "Custom.TShirtSize" })).toBe("L");
  });

  test("a blank override field is missing and never falls back to the default estimate", () => {
    const s = story({ estimation: 5, customFields: { "Custom.TShirtSize": "" } });
    expect(readStoryEstimate(s, { kind: "override", field: "Custom.TShirtSize" })).toBeUndefined();
    expect(readStoryEstimate(story({ estimation: 5 }), { kind: "override", field: "Custom.TShirtSize" })).toBeUndefined();
  });

  test("non-scalar field values are treated as missing", () => {
    const s = story({ customFields: { "Custom.Size": { displayName: "L" } } });
    expect(readStoryEstimate(s, { kind: "override", field: "Custom.Size" })).toBeUndefined();
  });
});

describe("numericStoryEstimate", () => {
  test("returns numbers and numeric strings", () => {
    expect(numericStoryEstimate(8)).toBe(8);
    expect(numericStoryEstimate("2.5")).toBe(2.5);
  });

  test("returns undefined for categories, blanks and missing values", () => {
    expect(numericStoryEstimate("L")).toBeUndefined();
    expect(numericStoryEstimate(" ")).toBeUndefined();
    expect(numericStoryEstimate(undefined)).toBeUndefined();
  });
});
