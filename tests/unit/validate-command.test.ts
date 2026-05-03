import { describe, expect, test } from "bun:test";
import {
  appendOfflineVerificationWarning,
  checkValueType,
  getCustomFieldVerificationSummary,
  getTemplateSummary,
  resolveValidateLogLevel,
  resolveValidationOptions,
} from "@/cli/commands/validate.command";
import type { TaskTemplate } from "@/templates/schema";
import type { ValidationResult } from "@/templates/validator";

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

describe("resolveValidateLogLevel", () => {
  test("returns undefined when quiet mode is not enabled", () => {
    expect(resolveValidateLogLevel({})).toBeUndefined();
  });

  test("returns error log level in quiet mode", () => {
    expect(resolveValidateLogLevel({ quiet: true })).toBe("error");
  });
});

describe("appendOfflineVerificationWarning", () => {
  function makeValidationResult(): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
      mode: "lenient",
    };
  }

  test("adds a warning in lenient mode for offline custom field verification", () => {
    const result = makeValidationResult();

    appendOfflineVerificationWarning(result, 2, false);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.path).toBe("tasks[*].customFields");
  });

  test("fails validation in strict mode for offline custom field verification", () => {
    const result = makeValidationResult();

    appendOfflineVerificationWarning(result, 1, true);

    expect(result.valid).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("STRICT_MODE_WARNING");
  });
});

describe("checkValueType", () => {
  test("rejects invalid boolean values", () => {
    const error = checkValueType(
      "Custom.IsBillable",
      "yes",
      "boolean",
      'tasks[0].customFields["Custom.IsBillable"]',
    );

    expect(error?.message).toContain("expects a boolean");
  });

  test("rejects invalid datetime values", () => {
    const error = checkValueType(
      "Custom.ReleaseDate",
      "next friday",
      "datetime",
      'tasks[0].customFields["Custom.ReleaseDate"]',
    );

    expect(error?.message).toContain("expects an ISO 8601 date or @Today macro");
  });
});

describe("getTemplateSummary", () => {
  function makeTemplate(
    name: string,
    tasks: Array<{
      estimationPercent?: number;
      condition?: string;
      customFields?: Record<string, string | number | boolean>;
    }>,
  ): TaskTemplate {
    return {
      name,
      tasks: tasks.map((t, i) => ({
        title: `Task ${i + 1}`,
        estimationPercent: t.estimationPercent ?? 0,
        customFields: t.customFields,
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

  test("reports offline custom field verification summary", () => {
    const template = makeTemplate("T", [
      { customFields: { "Custom.ClientTier": "Enterprise" } },
      { customFields: { "Custom.IsBillable": true, "Custom.Weight": 1.5 } },
    ]);

    expect(getCustomFieldVerificationSummary(template, "offline")).toEqual({
      count: 3,
      verificationStatus: "offline-unverified",
    });
  });

  test("reports online custom field verification summary", () => {
    const template = makeTemplate("T", [
      { customFields: { "Custom.ClientTier": "Enterprise" } },
    ]);

    expect(getCustomFieldVerificationSummary(template, "online")).toEqual({
      count: 1,
      verificationStatus: "online-verified",
    });
  });
});
