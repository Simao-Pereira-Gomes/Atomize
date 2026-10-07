import { describe, expect, mock, test } from "bun:test";
import { MOCK_ESTIMATION_DEFAULTS } from "@sppg2001/atomize-core/platforms/adapters/mock/mock.adapter";
import type { ADoFieldSchema } from "@sppg2001/atomize-core/platforms/interfaces/field-schema.interface";
import { verifyEstimationMapping } from "@sppg2001/atomize-core/templates/estimation-verifier";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import { verifyTemplate } from "@sppg2001/atomize-core/templates/template-verification";

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

const tShirt = (overrides: Partial<ADoFieldSchema> = {}) =>
  field("Custom.TShirtSize", { isPicklist: true, allowedValues: ["S", "M", "L", "XL"], allowsCustomValues: false, ...overrides });

const fieldsByType: Record<string, ADoFieldSchema[]> = {
  "User Story": [tShirt()],
  Task: [
    field("Microsoft.VSTS.Scheduling.RemainingWork", { type: "decimal" }),
    field("Custom.Notes"),
  ],
};

function platform(types: Record<string, ADoFieldSchema[]> = fieldsByType) {
  return {
    getFieldSchemas: mock(async (type?: string) => (type ? types[type] ?? [] : Object.values(types).flat())),
    getWorkItemTypes: mock(async () => Object.keys(types)),
    getEstimationDefaults: () => MOCK_ESTIMATION_DEFAULTS,
  };
}

function makeTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    version: "1.0",
    name: "Estimation",
    filter: { workItemTypes: ["User Story"] },
    tasks: [{ title: "Build", estimationPercent: 100 }],
    ...overrides,
  };
}

const tableTemplate = (table: Record<string, number>, extra: Partial<NonNullable<TaskTemplate["estimation"]>> = {}) =>
  makeTemplate({
    estimation: { strategy: "percentage", rounding: "none", source: "Custom.TShirtSize", conversion: { table }, ...extra },
  });

describe("verifyEstimationMapping", () => {
  test("does nothing when the Template overrides no part of the mapping", async () => {
    const p = platform();
    expect(await verifyEstimationMapping(makeTemplate(), p)).toEqual({ errors: [], warnings: [] });
    expect(p.getFieldSchemas).not.toHaveBeenCalled();
  });

  test("errors when taskType is not a work item type in the project", async () => {
    const { errors } = await verifyEstimationMapping(makeTemplate({ taskType: "Sub-task" }), platform());
    expect(errors).toEqual([
      expect.objectContaining({ path: "taskType", code: "ESTIMATION_TASK_TYPE_NOT_FOUND" }),
    ]);
  });

  test("errors when a target field is missing on the child type", async () => {
    const template = makeTemplate({
      estimation: { strategy: "percentage", rounding: "none", targetFields: ["Microsoft.VSTS.Scheduling.RemainingWork", "Custom.Effort"] },
    });
    const { errors } = await verifyEstimationMapping(template, platform());
    expect(errors).toEqual([
      expect.objectContaining({ path: "estimation.targetFields[1]", code: "ESTIMATION_TARGET_FIELD_NOT_FOUND" }),
    ]);
  });

  test("errors when a target field is not numeric", async () => {
    const template = makeTemplate({ estimation: { strategy: "percentage", rounding: "none", targetFields: ["Custom.Notes"] } });
    const { errors } = await verifyEstimationMapping(template, platform());
    expect(errors[0]).toMatchObject({ path: "estimation.targetFields[0]", code: "ESTIMATION_TARGET_FIELD_NOT_NUMERIC" });
  });

  test("checks target fields against the overridden taskType", async () => {
    const p = platform({ ...fieldsByType, Deliverable: [field("Custom.Effort", { type: "integer" })] });
    const template = makeTemplate({
      taskType: "Deliverable",
      estimation: { strategy: "percentage", rounding: "none", targetFields: ["Custom.Effort"] },
    });
    expect((await verifyEstimationMapping(template, p)).errors).toEqual([]);
    expect(p.getFieldSchemas).toHaveBeenCalledWith("Deliverable");
  });

  test("errors for each filtered Story type that lacks the source field", async () => {
    const p = platform({ ...fieldsByType, Bug: [] });
    const template = makeTemplate({
      filter: { workItemTypes: ["User Story", "Bug"] },
      estimation: { strategy: "percentage", rounding: "none", source: "Custom.TShirtSize" },
    });
    const { errors } = await verifyEstimationMapping(template, p);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ path: "estimation.source", code: "ESTIMATION_SOURCE_NOT_FOUND" });
    expect(errors[0]?.message).toContain('"Bug"');
  });

  test("warns about picklist values the table does not cover, naming them", async () => {
    const { warnings, errors } = await verifyEstimationMapping(tableTemplate({ S: 2, M: 4, L: 5 }), platform());
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe("estimation.conversion.table");
    expect(warnings[0]?.message).toContain('"XL"');
  });

  test("warns about table keys that are not allowed values, naming them", async () => {
    const { warnings } = await verifyEstimationMapping(tableTemplate({ S: 2, M: 4, Lg: 5, L: 5, XL: 13 }), platform());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('"Lg"');
  });

  test("a strict picklist fully covered by the table produces no warnings", async () => {
    const { warnings } = await verifyEstimationMapping(tableTemplate({ S: 2, M: 4, L: 5, XL: 13 }), platform());
    expect(warnings).toEqual([]);
  });

  test("warns that a suggested picklist is open-ended, while still naming uncovered listed values", async () => {
    const p = platform({ ...fieldsByType, "User Story": [tShirt({ allowsCustomValues: true })] });
    const { warnings } = await verifyEstimationMapping(tableTemplate({ S: 2, M: 4, L: 5 }), p);
    expect(warnings.map((w) => w.path)).toEqual(["estimation.conversion.table", "estimation.source"]);
    expect(warnings[0]?.message).toContain('"XL"');
    expect(warnings[1]?.message).toContain("suggested picklist");
  });

  test("with multipliers, listed values that parse count as covered and their keys are used", async () => {
    const p = platform({ ...fieldsByType, "User Story": [tShirt({ allowedValues: ["0.3XL", "0.5XL", "XL"] })] });
    const template = makeTemplate({
      estimation: { strategy: "percentage", rounding: "none", source: "Custom.TShirtSize", conversion: { table: { XL: 5 }, multipliers: true } },
    });
    expect((await verifyEstimationMapping(template, p)).warnings).toEqual([]);
  });

  test("with multipliers, a key only used through multiplier values is not reported as never matching", async () => {
    const p = platform({ ...fieldsByType, "User Story": [tShirt({ allowedValues: ["0.5L", "L"] })] });
    const template = makeTemplate({
      estimation: { strategy: "percentage", rounding: "none", source: "Custom.TShirtSize", conversion: { table: { L: 5, XL: 13 }, multipliers: true } },
    });
    const { warnings } = await verifyEstimationMapping(template, p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('"XL"');
    expect(warnings[0]?.message).not.toContain('"L"');
  });

  test("the open-ended warning explains multiplier parsing when it is on", async () => {
    const p = platform({ ...fieldsByType, "User Story": [field("Custom.TShirtSize", { allowsCustomValues: true })] });
    const template = makeTemplate({
      estimation: { strategy: "percentage", rounding: "none", source: "Custom.TShirtSize", conversion: { table: { XL: 5 }, multipliers: true } },
    });
    const { warnings } = await verifyEstimationMapping(template, p);
    expect(warnings[0]?.message).toContain("parses as a number followed by a key");
  });

  test("warns that a free-text source field is open-ended", async () => {
    const p = platform({ ...fieldsByType, "User Story": [field("Custom.TShirtSize", { allowsCustomValues: true })] });
    const { warnings } = await verifyEstimationMapping(tableTemplate({ L: 5 }), p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("free-text");
  });

  test("warns about numeric operators on estimation when the source holds text values", async () => {
    const template = tableTemplate(
      { S: 2, M: 4, L: 5, XL: 13 },
    );
    template.tasks = [
      { title: "Build", estimationPercent: 90 },
      { title: "Review", estimationPercent: 10, condition: { all: [{ field: "estimation", operator: "gte", value: 5 }] } },
    ];
    const { warnings } = await verifyEstimationMapping(template, platform());
    expect(warnings).toEqual([expect.objectContaining({ path: "tasks[1].condition" })]);
  });

  test("does not flag numeric operators when the source field is numeric", async () => {
    const p = platform({ ...fieldsByType, "User Story": [field("Custom.Points", { type: "decimal" })] });
    const template = makeTemplate({
      estimation: { strategy: "percentage", rounding: "none", source: "Custom.Points" },
      tasks: [{ title: "Build", estimationPercent: 100, condition: { field: "estimation", operator: "gte", value: 5 } }],
    });
    expect(await verifyEstimationMapping(template, p)).toEqual({ errors: [], warnings: [] });
  });
});

describe("verifyTemplate with estimation overrides", () => {
  const uncovered = () => tableTemplate({ S: 2, M: 4, L: 5 });

  test("lenient mode reports coverage gaps as warnings", async () => {
    const result = await verifyTemplate(uncovered(), {
      project: { mode: "online", platform: { ...platform(), listSavedQueries: async () => [] } },
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.path === "estimation.conversion.table")).toBe(true);
  });

  test("strict mode escalates coverage gaps to errors", async () => {
    const result = await verifyTemplate(uncovered(), {
      project: { mode: "online", strict: true, platform: { ...platform(), listSavedQueries: async () => [] } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "estimation.conversion.table" && e.code === "STRICT_MODE_WARNING")).toBe(true);
  });

  test("a Template in strict validation mode escalates coverage gaps too", async () => {
    const template = { ...uncovered(), validation: { mode: "strict" as const } };
    const result = await verifyTemplate(template, {
      project: { mode: "online", platform: { ...platform(), listSavedQueries: async () => [] } },
    });
    expect(result.valid).toBe(false);
  });

  test("estimation overrides make online verification necessary", async () => {
    const result = await verifyTemplate(makeTemplate({ taskType: "Task" }));
    expect(result.requirements.hasEstimationMapping).toBe(true);
    expect(result.requirements.needsOnlineVerification).toBe(true);
  });
});
