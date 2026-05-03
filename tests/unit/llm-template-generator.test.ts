import { describe, expect, test } from "bun:test";
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseAndValidate,
} from "@services/template/llm-template-generator";

// ─── buildSystemPrompt ────────────────────────────────────────────────────────

describe("buildSystemPrompt", () => {
  test("includes schema key terms", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("estimationPercent");
    expect(prompt).toContain("workItemTypes");
    expect(prompt).toContain("filter");
    expect(prompt).toContain("tasks");
  });

  test("includes operator list", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("equals");
    expect(prompt).toContain("not-equals");
    expect(prompt).toContain("contains");
  });

  test("includes the critical constraint about estimation summing to 100", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("sum to exactly 100");
  });

  test("includes at least one example template", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Example 1");
    expect(prompt).toContain("estimationPercent:");
  });

  test("instructs no markdown fences in output", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("No prose");
    expect(prompt).toContain("no markdown fences");
  });
});

// ─── buildUserPrompt ──────────────────────────────────────────────────────────

describe("buildUserPrompt", () => {
  test("wraps description in plain form on first attempt", () => {
    const prompt = buildUserPrompt("backend API stories");
    expect(prompt).toContain("backend API stories");
    expect(prompt).not.toContain("Previous attempt");
  });

  test("appends grounding context when provided", () => {
    const prompt = buildUserPrompt("feature template", "Common tasks: Design (20%), Implement (80%)");
    expect(prompt).toContain("Observed patterns from this user");
    expect(prompt).toContain("Design (20%)");
  });

  test("does not include grounding section when context is null", () => {
    const prompt = buildUserPrompt("feature template", null);
    expect(prompt).not.toContain("Observed patterns");
  });

  test("appends error correction context on retry", () => {
    const prompt = buildUserPrompt("feature template", null, [
      "tasks.estimationPercent: must sum to 100",
    ]);
    expect(prompt).toContain("Previous attempt failed validation");
    expect(prompt).toContain("must sum to 100");
  });

  test("lists all errors as bullet points on retry", () => {
    const errors = ["error one", "error two", "error three"];
    const prompt = buildUserPrompt("desc", null, errors);
    for (const e of errors) {
      expect(prompt).toContain(`- ${e}`);
    }
  });
});

// ─── parseAndValidate ─────────────────────────────────────────────────────────

const VALID_YAML = `version: "1.0"
name: "Test Template"
filter:
  workItemTypes: ["User Story"]
  states: ["Active"]
  excludeIfHasTasks: true
tasks:
  - title: "Task One"
    estimationPercent: 60
  - title: "Task Two"
    estimationPercent: 40
`;

const INVALID_YAML = `this: is: not: valid: yaml: {{{{`;

const VALID_YAML_WITH_FENCES = `\`\`\`yaml\n${VALID_YAML}\`\`\``;

describe("parseAndValidate", () => {
  test("returns ok:true for valid template YAML", () => {
    const result = parseAndValidate(VALID_YAML);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.name).toBe("Test Template");
    }
  });

  test("strips markdown fences before parsing", () => {
    const result = parseAndValidate(VALID_YAML_WITH_FENCES);
    expect(result.ok).toBe(true);
  });

  test("returns ok:false with YAML error for invalid YAML", () => {
    const result = parseAndValidate(INVALID_YAML);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/not valid YAML/i);
    }
  });

  test("returns ok:false with validation errors for schema-violating YAML", () => {
    const missingName = `version: "1.0"\nfilter:\n  workItemTypes: ["User Story"]\ntasks:\n  - title: "T"\n    estimationPercent: 100\n`;
    const result = parseAndValidate(missingName);
    // name is required — should fail validation
    expect(result.ok).toBe(false);
  });

  test("returns ok:false for template missing required name field", () => {
    const missingRequired = `version: "1.0"
filter:
  workItemTypes: ["User Story"]
tasks:
  - title: "Task One"
    estimationPercent: 100
`;
    const result = parseAndValidate(missingRequired);
    expect(result.ok).toBe(false);
  });
});
