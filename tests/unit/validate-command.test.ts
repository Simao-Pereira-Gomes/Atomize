import { describe, expect, test } from "bun:test";
import {
  getTemplateSummary,
  resolveValidationOptions,
} from "@/cli/commands/validate.command";
import type { TaskTemplate } from "@/templates/schema";

describe("resolveValidationOptions", () => {
  test("returns empty options when no flags are set (uses template config)", () => {
    expect(resolveValidationOptions({})).toEqual({});
  });

  test("returns strict mode when --strict flag is present", () => {
    expect(resolveValidationOptions({ strict: true })).toEqual({
      mode: "strict",
    });
  });

});

describe("getTemplateSummary", () => {
  function makeTemplate(
    name: string,
    tasks: Array<{ estimationPercent?: number; condition?: string }>,
  ): TaskTemplate {
    return {
      name,
      tasks: tasks.map((t, i) => ({
        title: `Task ${i + 1}`,
        estimationPercent: t.estimationPercent ?? 0,
        ...(t.condition ? { condition: t.condition } : {}),
      })),
    } as unknown as TaskTemplate;
  }

  test("returns the template name", () => {
    const template = makeTemplate("My Template", [{ estimationPercent: 100 }]);
    expect(getTemplateSummary(template).name).toBe("My Template");
  });

  test("returns the total task count including conditional tasks", () => {
    const template = makeTemplate("T", [
      { estimationPercent: 60 },
      { estimationPercent: 40, condition: "someCondition" },
    ]);
    expect(getTemplateSummary(template).tasks).toBe(2);
  });

  test("sums estimation only from non-conditional tasks", () => {
    const template = makeTemplate("T", [
      { estimationPercent: 60 },
      { estimationPercent: 40, condition: "someCondition" },
    ]);
    expect(getTemplateSummary(template).totalEstimation).toBe("60%");
  });

  test("sums all tasks when none are conditional", () => {
    const template = makeTemplate("T", [
      { estimationPercent: 30 },
      { estimationPercent: 70 },
    ]);
    expect(getTemplateSummary(template).totalEstimation).toBe("100%");
  });

  test("returns 0% total when all tasks are conditional", () => {
    const template = makeTemplate("T", [
      { estimationPercent: 50, condition: "flagA" },
      { estimationPercent: 50, condition: "flagB" },
    ]);
    expect(getTemplateSummary(template).totalEstimation).toBe("0%");
  });

  test("returns 0 tasks and 0% for a template with no tasks", () => {
    const template = makeTemplate("Empty", []);
    expect(getTemplateSummary(template).tasks).toBe(0);
    expect(getTemplateSummary(template).totalEstimation).toBe("0%");
  });

  test("handles tasks with undefined estimationPercent (treated as 0)", () => {
    const template = makeTemplate("T", [{ estimationPercent: 50 }, {}]);
    expect(getTemplateSummary(template).totalEstimation).toBe("50%");
  });
});
