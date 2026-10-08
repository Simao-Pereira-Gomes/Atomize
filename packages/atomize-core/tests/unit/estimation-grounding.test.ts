import { describe, expect, test } from "bun:test";
import { AZURE_DEVOPS_ESTIMATION_DEFAULTS } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/estimation-defaults";
import type { ADoFieldSchema } from "@sppg2001/atomize-core/platforms/interfaces/field-schema.interface";
import { buildEstimationGrounding } from "@sppg2001/atomize-core/services/template/estimation-grounding";

function field(referenceName: string, overrides: Partial<ADoFieldSchema> = {}): ADoFieldSchema {
  return {
    referenceName,
    name: referenceName,
    type: "string",
    isCustom: referenceName.startsWith("Custom."),
    isReadOnly: false,
    isMultiline: false,
    isPicklist: false,
    ...overrides,
  };
}

describe("buildEstimationGrounding", () => {
  const grounding = buildEstimationGrounding(AZURE_DEVOPS_ESTIMATION_DEFAULTS, {
    "User Story": [
      field("Microsoft.VSTS.Scheduling.StoryPoints", { type: "decimal" }),
      field("Custom.TShirtSize", { isPicklist: true, allowedValues: ["S", "M", "L"] }),
      field("Custom.Points", { type: "integer" }),
      field("Custom.SizeText"),
      field("Custom.Notes", { isMultiline: true }),
      field("Custom.Computed", { type: "decimal", isReadOnly: true }),
      field("System.Title"),
    ],
    Task: [field("Microsoft.VSTS.Scheduling.RemainingWork", { type: "decimal" })],
    Epic: [field("System.Title")],
  });

  test("carries the platform's default estimation mapping", () => {
    expect(grounding.defaults).toEqual({
      storyEstimateFields: [...AZURE_DEVOPS_ESTIMATION_DEFAULTS.storyEstimateFields],
      taskWorkItemType: "Task",
      taskEstimateFields: [...AZURE_DEVOPS_ESTIMATION_DEFAULTS.taskEstimateFields],
      unitLabel: "hours",
    });
  });

  test("lists writable numeric and single-line text Story fields, custom first, excluding System.*, read-only and multi-line", () => {
    expect(grounding.storyEstimateFieldsByWorkItemType["User Story"]?.map((f) => f.referenceName)).toEqual([
      "Custom.Points",
      "Custom.SizeText",
      "Custom.TShirtSize",
      "Microsoft.VSTS.Scheduling.StoryPoints",
    ]);
    expect(grounding.storyEstimateFieldsByWorkItemType["User Story"]?.find((f) => f.referenceName === "Custom.TShirtSize")).toEqual({
      referenceName: "Custom.TShirtSize",
      name: "Custom.TShirtSize",
      type: "string",
      isPicklist: true,
      allowedValues: ["S", "M", "L"],
    });
  });

  test("includes process-defined fields outside the Custom namespace", () => {
    const process = buildEstimationGrounding(AZURE_DEVOPS_ESTIMATION_DEFAULTS, {
      "User Story": [field("MyCompany.TShirtSize", { isCustom: false, isPicklist: true, allowedValues: ["S", "L"] })],
    });
    expect(process.storyEstimateFieldsByWorkItemType["User Story"]?.map((f) => f.referenceName)).toEqual(["MyCompany.TShirtSize"]);
  });

  test("leaves out the child Task type and types with no estimate-capable fields", () => {
    expect(Object.keys(grounding.storyEstimateFieldsByWorkItemType)).toEqual(["User Story"]);
  });
});
