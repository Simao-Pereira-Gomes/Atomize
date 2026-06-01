import { describe, expect, mock, test } from "bun:test";
import { verifyTemplate } from "@templates/template-verification";
import type { TaskTemplate } from "@/templates/schema";

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
