import { describe, expect, mock, test } from "bun:test";
import { MOCK_ESTIMATION_DEFAULTS } from "@sppg2001/atomize-core/platforms/adapters/mock/mock.adapter";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import { verifyTemplate } from "@sppg2001/atomize-core/templates/template-verification";

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
});
