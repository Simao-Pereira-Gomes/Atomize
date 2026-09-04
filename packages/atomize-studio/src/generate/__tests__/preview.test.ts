import { describe, expect, it } from "vitest";
import { buildMockStoryJson, describeSkippedTaskReason, formatAllocationPercentage, parseInspectResult, parsePreviewResult, previewSourceDetail, previewSourceLabel, previewSourceValue } from "../preview";

describe("parseInspectResult", () => {
  it("accepts a well-formed InspectResult", () => {
    const value = { fields: [{ name: "estimation", type: "number", sources: ["estimation"], required: true }] };
    expect(parseInspectResult(value)).toEqual(value);
  });

  it("rejects a response with no fields array", () => {
    expect(() => parseInspectResult({})).toThrow("unexpected response");
  });
});

describe("parsePreviewResult", () => {
  it("accepts a well-formed PreviewResult", () => {
    const value = { tasks: [], skippedTasks: [], estimationSummary: { storyEstimation: 0, totalTaskEstimation: 0, percentageUsed: 0 } };
    expect(parsePreviewResult(value)).toEqual(value);
  });

  it("rejects a response missing skippedTasks", () => {
    expect(() => parsePreviewResult({ tasks: [] })).toThrow("unexpected response");
  });
});

describe("formatAllocationPercentage", () => {
  it("rounds floating-point allocation for display without hiding over-allocation", () => {
    expect(formatAllocationPercentage(103.84615384615384)).toBe("103.8");
    expect(formatAllocationPercentage(100)).toBe("100.0");
  });
});

describe("describeSkippedTaskReason", () => {
  it("translates a serialized condition into a sentence", () => {
    expect(describeSkippedTaskReason('Condition not met: {"field":"tags","operator":"contains","value":"backend"}')).toBe("The Mock Story did not satisfy this rule: tags includes “backend”.");
  });
});

describe("previewSourceValue / previewSourceLabel", () => {
  it("uses the catalog ref as the value and the display name as the label", () => {
    const source = { kind: "catalog" as const, ref: "template:delivery" as const, displayName: "Delivery" };
    expect(previewSourceValue(source)).toBe("template:delivery");
    expect(previewSourceLabel(source)).toBe("Delivery");
    expect(previewSourceDetail(source)).toBe("Catalog · template:delivery");
  });

  it("uses the file path as both value and label", () => {
    const source = { kind: "file" as const, path: "/tmp/delivery.atomize.yaml" };
    expect(previewSourceValue(source)).toBe("/tmp/delivery.atomize.yaml");
    expect(previewSourceLabel(source)).toBe("delivery.atomize.yaml");
    expect(previewSourceDetail(source)).toBe("Local file · tmp/delivery.atomize.yaml");
  });
});

describe("buildMockStoryJson", () => {
  const fields = [
    { name: "estimation", type: "number" as const, sources: ["estimation" as const] },
    { name: "tags", type: "string[]" as const, sources: ["condition" as const] },
    { name: "Custom.Flag", type: "boolean" as const, sources: ["condition" as const] },
    { name: "state", type: "string" as const, sources: ["filter" as const] },
    { name: "Custom.ClientTier", type: "unknown" as const, sources: ["condition" as const] },
  ];

  it("coerces each field to its typed JSON value", () => {
    const json = buildMockStoryJson(fields, {
      estimation: "10",
      tags: "backend, urgent",
      "Custom.Flag": "true",
      state: "Active",
      "Custom.ClientTier": "Enterprise",
    });
    expect(JSON.parse(json)).toEqual({
      estimation: 10,
      tags: ["backend", "urgent"],
      state: "Active",
      customFields: {
        "Custom.Flag": true,
        "Custom.ClientTier": "Enterprise",
      },
    });
  });

  it("omits fields left blank", () => {
    const json = buildMockStoryJson(fields, { estimation: "10" });
    expect(JSON.parse(json)).toEqual({ estimation: 10 });
  });

  it("omits a number field whose input does not parse", () => {
    const json = buildMockStoryJson(fields, { estimation: "not a number" });
    expect(JSON.parse(json)).toEqual({});
  });

  it("drops empty entries from a comma-separated list", () => {
    const json = buildMockStoryJson(fields, { tags: "backend, , urgent," });
    expect(JSON.parse(json)).toEqual({ tags: ["backend", "urgent"] });
  });
});
