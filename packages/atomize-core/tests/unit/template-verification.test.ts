import { describe, expect, mock, test } from "bun:test";
import { MOCK_ESTIMATION_DEFAULTS, MockPlatformAdapter } from "@sppg2001/atomize-core/platforms/adapters/mock/mock.adapter";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import { projectVerificationPlatform, verifyTemplate } from "@sppg2001/atomize-core/templates/template-verification";

function makeTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    version: "1.0",
    name: "Verification Template",
    filter: { workItemTypes: ["User Story"] },
    tasks: [{ title: "Build", estimationPercent: 100 }],
    ...overrides,
  };
}

describe("verifyTemplate", () => {
  const withCustomField = (overrides: Partial<TaskTemplate> = {}) =>
    makeTemplate({
      tasks: [{ title: "Build", estimationPercent: 100, customFields: { "Custom.ClientTier": "Enterprise" } }],
      ...overrides,
    });

  test("Online Validation checks custom fields against the Template's taskType", async () => {
    const getFieldSchemas = mock(async (_type?: string) => []);
    await verifyTemplate(withCustomField({ taskType: "Sub-task" }), {
      project: {
        mode: "online",
        platform: { getFieldSchemas, listSavedQueries: mock(async () => []), getEstimationDefaults: () => MOCK_ESTIMATION_DEFAULTS },
      },
    });

    expect(getFieldSchemas.mock.calls[0]?.[0]).toBe("Sub-task");
  });

  test("Online Validation falls back to the adapter's default child type", async () => {
    const getFieldSchemas = mock(async (_type?: string) => []);
    const result = await verifyTemplate(withCustomField(), {
      project: {
        mode: "online",
        platform: { getFieldSchemas, listSavedQueries: mock(async () => []), getEstimationDefaults: () => MOCK_ESTIMATION_DEFAULTS },
      },
    });

    expect(getFieldSchemas.mock.calls[0]?.[0]).toBe("Task");
    expect(result.errors.find((e) => e.code === "CUSTOM_FIELD_NOT_FOUND")?.message).toContain('work item type "Task"');
  });

  test("returns structural validation plus project requirements", async () => {
    const result = await verifyTemplate(makeTemplate());

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.requirements.needsOnlineVerification).toBe(false);
  });

  test("adds offline project warnings to the validation result", async () => {
    const template = makeTemplate({
      tasks: [{
        title: "Build",
        estimationPercent: 100,
        customFields: { "Custom.ClientTier": "Enterprise" },
      }],
    });

    const result = await verifyTemplate(template, {
      project: { mode: "offline" },
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) =>
      warning.path === "tasks[*].customFields"
    )).toBe(true);
    expect(result.requirements.needsOnlineVerification).toBe(true);
  });

  test("marks result invalid when online project verification fails", async () => {
    const template = makeTemplate({
      filter: { savedQuery: { path: "Shared Queries/Missing" } },
    });

    const result = await verifyTemplate(template, {
      project: {
        mode: "online",
        platform: {
          getFieldSchemas: mock(async () => []),
          listSavedQueries: mock(async () => []),
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === "SAVED_QUERY_NOT_FOUND"))
      .toBe(true);
  });

  test("reports project-reference issues on their own, apart from structural ones", async () => {
    const template = withCustomField({ tasks: [{ title: "", estimationPercent: 100, customFields: { "Custom.ClientTier": "Enterprise" } }] });
    const result = await verifyTemplate(template, {
      project: {
        mode: "online",
        platform: { getFieldSchemas: async () => [], listSavedQueries: async () => [], getEstimationDefaults: () => MOCK_ESTIMATION_DEFAULTS },
      },
    });

    expect(result.project?.errors.map((e) => e.code)).toEqual(["CUSTOM_FIELD_NOT_FOUND"]);
    expect(result.errors.length).toBeGreaterThan(result.project?.errors.length ?? 0);
  });

  test("has no project section when project references were not checked", async () => {
    expect((await verifyTemplate(makeTemplate())).project).toBeUndefined();
  });

  test("Online Validation against the Mock adapter flags a saved query and custom field the project lacks", async () => {
    const template = withCustomField({ filter: { workItemTypes: ["User Story"], savedQuery: { path: "Shared Queries/Missing" } } });
    const result = await verifyTemplate(template, { project: { mode: "online", platform: new MockPlatformAdapter() } });

    expect(result.valid).toBe(false);
    expect(result.project?.errors.map((e) => e.code).sort()).toEqual(["CUSTOM_FIELD_NOT_FOUND", "SAVED_QUERY_NOT_FOUND"]);
  });

  test("Offline Validation reports what it could not check without failing", async () => {
    const template = withCustomField({ filter: { workItemTypes: ["User Story"], savedQuery: { path: "Shared Queries/Missing" } } });
    const result = await verifyTemplate(template, { project: { mode: "offline" } });

    expect(result.valid).toBe(true);
    expect(result.project?.warnings.map((w) => w.path)).toContain("filter.savedQuery");
  });

  test("reads Online Validation's project metadata from a Platform Adapter", async () => {
    const adapter = new MockPlatformAdapter();
    const result = await verifyTemplate(withCustomField(), { project: { mode: "online", platform: projectVerificationPlatform(adapter) } });

    expect(result.project?.errors.map((e) => e.code)).toEqual(["CUSTOM_FIELD_NOT_FOUND"]);
  });

  test("Offline Validation warns that custom fields were not checked, and fails under strict", async () => {
    const lenient = await verifyTemplate(withCustomField(), { project: { mode: "offline" } });
    expect(lenient.valid).toBe(true);
    expect(lenient.warnings.map((w) => w.path)).toContain("tasks[*].customFields");

    const strict = await verifyTemplate(withCustomField(), { project: { mode: "offline", strict: true } });
    expect(strict.valid).toBe(false);
    expect(strict.errors.map((e) => e.code)).toContain("STRICT_MODE_WARNING");
  });

  test("Online Validation rejects custom field values of the wrong type", async () => {
    const field = (referenceName: string, type: "boolean" | "datetime") => ({
      referenceName, name: referenceName, type, isCustom: true, isReadOnly: false, isMultiline: false, isPicklist: false,
    });
    const template = makeTemplate({
      tasks: [{ title: "Build", estimationPercent: 100, customFields: { "Custom.IsBillable": "yes", "Custom.ReleaseDate": "next friday" } }],
    });
    const result = await verifyTemplate(template, {
      project: {
        mode: "online",
        platform: {
          getFieldSchemas: async () => [field("Custom.IsBillable", "boolean"), field("Custom.ReleaseDate", "datetime")],
          listSavedQueries: async () => [],
          getEstimationDefaults: () => MOCK_ESTIMATION_DEFAULTS,
        },
      },
    });

    const messages = result.errors.map((e) => e.message).join("\n");
    expect(messages).toContain("expects a boolean");
    expect(messages).toContain("expects an ISO 8601 date or @Today macro");
  });

  test("Online Validation rejects a custom field value outside its picklist", async () => {
    const result = await verifyTemplate(makeTemplate({
      tasks: [{ title: "Build", estimationPercent: 100, customFields: { "Custom.ClientTier": "VIP" } }],
    }), {
      project: {
        mode: "online",
        platform: {
          getFieldSchemas: async (type) => type === "Task"
            ? [{ referenceName: "Custom.ClientTier", name: "Client Tier", type: "string", isCustom: true, isReadOnly: false, isMultiline: false, isPicklist: true, allowedValues: ["Standard", "Premium", "Enterprise"] }]
            : [],
          listSavedQueries: async () => [],
          getEstimationDefaults: () => MOCK_ESTIMATION_DEFAULTS,
        },
      },
    });

    expect(result.project?.errors.map((e) => e.code)).toEqual(["CUSTOM_FIELD_INVALID_PICKLIST_VALUE"]);
  });

  test("Online Validation flags a condition on a custom field the Story types lack", async () => {
    const result = await verifyTemplate(makeTemplate({
      tasks: [{ title: "Build", estimationPercent: 100, condition: { customField: "Custom.ClientTier", operator: "equals", value: "Enterprise" } }],
    } as Partial<TaskTemplate>), {
      project: {
        mode: "online",
        platform: {
          getFieldSchemas: async () => [{ referenceName: "Custom.OtherField", name: "Other", type: "string", isCustom: true, isReadOnly: false, isMultiline: false, isPicklist: false }],
          listSavedQueries: async () => [],
          getEstimationDefaults: () => MOCK_ESTIMATION_DEFAULTS,
        },
      },
    });

    expect(result.project?.errors.map((e) => e.code)).toEqual(["CONDITION_FIELD_NOT_FOUND"]);
  });
});
