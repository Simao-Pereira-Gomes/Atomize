import { describe, expect, test } from "bun:test";
import {
  type EstimationFieldInfo,
  isEstimateSourceField,
  isEstimateTargetField,
  matchesFieldPattern,
  sortEstimateFields,
} from "../../src/estimation-fields";

const field = (referenceName: string, overrides: Partial<EstimationFieldInfo> = {}): EstimationFieldInfo => ({
  referenceName,
  name: referenceName,
  type: "string",
  ...overrides,
});

const ado = {
  storyEstimateFields: ["Microsoft.VSTS.Scheduling.StoryPoints", "Microsoft.VSTS.Scheduling.Effort"],
  nonEstimateFields: ["Microsoft.VSTS.Common.*", "Microsoft.VSTS.TCM.*"],
};

describe("matchesFieldPattern", () => {
  test("matches exact names and whole namespaces", () => {
    expect(matchesFieldPattern("Microsoft.VSTS.Common.Priority", ["Microsoft.VSTS.Common.*"])).toBe(true);
    expect(matchesFieldPattern("Microsoft.VSTS.Scheduling.Effort", ["Microsoft.VSTS.Common.*"])).toBe(false);
    expect(matchesFieldPattern("Custom.Rank", ["Custom.Rank"])).toBe(true);
    expect(matchesFieldPattern("Custom.Ranking", ["Custom.Rank"])).toBe(false);
  });
});

describe("isEstimateSourceField", () => {
  test("accepts default estimate fields, custom fields and process fields outside excluded namespaces", () => {
    expect(isEstimateSourceField(field("Microsoft.VSTS.Scheduling.StoryPoints", { type: "decimal" }), ado)).toBe(true);
    expect(isEstimateSourceField(field("Custom.TShirtSize", { isPicklist: true }), ado)).toBe(true);
    expect(isEstimateSourceField(field("MyCompany.Size"), ado)).toBe(true);
  });

  test("rejects System.*, platform non-estimate namespaces, read-only and multi-line fields", () => {
    expect(isEstimateSourceField(field("System.Title"), ado)).toBe(false);
    expect(isEstimateSourceField(field("Microsoft.VSTS.Common.Priority", { type: "integer", isPicklist: true }), ado)).toBe(false);
    expect(isEstimateSourceField(field("Microsoft.VSTS.Common.ValueArea", { isPicklist: true }), ado)).toBe(false);
    expect(isEstimateSourceField(field("Custom.Computed", { type: "decimal", isReadOnly: true }), ado)).toBe(false);
    expect(isEstimateSourceField(field("Custom.Notes", { isMultiline: true }), ado)).toBe(false);
  });
});

describe("isEstimateTargetField", () => {
  test("accepts writable numeric effort fields only", () => {
    expect(isEstimateTargetField(field("Microsoft.VSTS.Scheduling.RemainingWork", { type: "decimal" }), ado)).toBe(true);
    expect(isEstimateTargetField(field("Custom.Effort", { type: "integer" }), ado)).toBe(true);
    expect(isEstimateTargetField(field("Microsoft.VSTS.Common.StackRank", { type: "decimal" }), ado)).toBe(false);
    expect(isEstimateTargetField(field("Custom.Level", { type: "integer", isPicklist: true }), ado)).toBe(false);
    expect(isEstimateTargetField(field("System.Rev", { type: "integer" }), ado)).toBe(false);
    expect(isEstimateTargetField(field("Custom.Size"), ado)).toBe(false);
  });
});

describe("sortEstimateFields", () => {
  test("lists custom fields first, then by name", () => {
    const sorted = sortEstimateFields([
      field("Microsoft.VSTS.Scheduling.StoryPoints", { name: "Story Points" }),
      field("Custom.Size", { name: "T-shirt size" }),
      field("Custom.Complexity", { name: "Complexity" }),
    ]);
    expect(sorted.map((f) => f.name)).toEqual(["Complexity", "T-shirt size", "Story Points"]);
  });
});
