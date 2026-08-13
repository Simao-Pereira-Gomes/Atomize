import { describe, expect, test } from "bun:test";
import { ConditionEvaluator, extractCustomFieldRefs } from "../../src/core/condition-evaluator";
import type { WorkItem } from "../../src/platforms/interfaces/work-item.interface";
import type { Condition } from "../../src/templates/schema";

describe("ConditionEvaluator", () => {
  const evaluator = new ConditionEvaluator();

  const sampleStory: WorkItem = {
    id: "123",
    title: "User Authentication Story",
    type: "User Story",
    state: "Active",
    tags: ["backend", "security", "api"],
    estimation: 13,
    description: "Implement user authentication with JWT tokens",
    priority: 1,
    customFields: {
      component: "auth",
      needsDatabase: true,
      complexity: "high",
    },
  };

  describe("Absent / null conditions", () => {
    test("should return true for undefined condition", () => {
      expect(evaluator.evaluateCondition(undefined, sampleStory)).toBe(true);
    });

    test("should return true for null condition", () => {
      expect(evaluator.evaluateCondition(null, sampleStory)).toBe(true);
    });
  });

  describe("contains / not-contains operator", () => {
    test("should evaluate contains with tags array", () => {
      const cond: Condition = { field: "tags", operator: "contains", value: "backend" };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(true);
    });

    test("should evaluate contains case-insensitively", () => {
      const cond: Condition = { field: "tags", operator: "contains", value: "BACKEND" };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(true);
    });

    test("should return false when tag not found", () => {
      const cond: Condition = { field: "tags", operator: "contains", value: "frontend" };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(false);
    });

    test("should evaluate contains with title substring", () => {
      const cond: Condition = { field: "title", operator: "contains", value: "Authentication" };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(true);
    });

    test("should evaluate not-contains", () => {
      const cond: Condition = { field: "tags", operator: "not-contains", value: "frontend" };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(true);
    });

    test("should return false for not-contains when tag is present", () => {
      const cond: Condition = { field: "tags", operator: "not-contains", value: "backend" };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(false);
    });
  });

  describe("equals / not-equals operator", () => {
    test("should evaluate equals with numbers", () => {
      expect(evaluator.evaluateCondition({ field: "estimation", operator: "equals", value: 13 }, sampleStory)).toBe(true);
    });

    test("should evaluate equals with strings", () => {
      expect(evaluator.evaluateCondition({ field: "state", operator: "equals", value: "Active" }, sampleStory)).toBe(true);
    });

    test("should evaluate not-equals with numbers", () => {
      expect(evaluator.evaluateCondition({ field: "estimation", operator: "not-equals", value: 8 }, sampleStory)).toBe(true);
    });

    test("should evaluate not-equals with strings", () => {
      expect(evaluator.evaluateCondition({ field: "state", operator: "not-equals", value: "Closed" }, sampleStory)).toBe(true);
    });

    test("should evaluate boolean custom fields", () => {
      const cond: Condition = { customField: "Custom.NeedsDatabase", operator: "equals", value: true };
      const story = { ...sampleStory, customFields: { "Custom.NeedsDatabase": true } };
      expect(evaluator.evaluateCondition(cond, story)).toBe(true);
    });

    test("should be case-insensitive for string equals", () => {
      expect(evaluator.evaluateCondition({ field: "state", operator: "equals", value: "active" }, sampleStory)).toBe(true);
    });
  });

  describe("Numeric comparison operators (gt, lt, gte, lte)", () => {
    test("should evaluate gt", () => {
      expect(evaluator.evaluateCondition({ field: "estimation", operator: "gt", value: 10 }, sampleStory)).toBe(true);
    });

    test("should evaluate lt", () => {
      expect(evaluator.evaluateCondition({ field: "estimation", operator: "lt", value: 5 }, sampleStory)).toBe(false);
    });

    test("should evaluate gte", () => {
      expect(evaluator.evaluateCondition({ field: "estimation", operator: "gte", value: 13 }, sampleStory)).toBe(true);
    });

    test("should evaluate lte", () => {
      expect(evaluator.evaluateCondition({ field: "estimation", operator: "lte", value: 20 }, sampleStory)).toBe(true);
    });

    test("should evaluate priority with gt operator", () => {
      expect(evaluator.evaluateCondition({ field: "priority", operator: "gt", value: 0 }, sampleStory)).toBe(true);
    });
  });

  describe("Compound operators (all, any)", () => {
    test("should evaluate all with both true", () => {
      const cond: Condition = {
        all: [
          { field: "tags", operator: "contains", value: "backend" },
          { field: "estimation", operator: "gt", value: 10 },
        ],
      };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(true);
    });

    test("should evaluate all with one false", () => {
      const cond: Condition = {
        all: [
          { field: "tags", operator: "contains", value: "backend" },
          { field: "estimation", operator: "lt", value: 5 },
        ],
      };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(false);
    });

    test("should evaluate any with one true", () => {
      const cond: Condition = {
        any: [
          { field: "tags", operator: "contains", value: "frontend" },
          { field: "tags", operator: "contains", value: "backend" },
        ],
      };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(true);
    });

    test("should evaluate any with all false", () => {
      const cond: Condition = {
        any: [
          { field: "tags", operator: "contains", value: "frontend" },
          { field: "tags", operator: "contains", value: "mobile" },
        ],
      };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(false);
    });

    test("should evaluate nested compound conditions", () => {
      const cond: Condition = {
        any: [
          {
            all: [
              { field: "tags", operator: "contains", value: "backend" },
              { field: "estimation", operator: "gt", value: 5 },
            ],
          },
          { field: "priority", operator: "equals", value: 1 },
        ],
      };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(true);
    });
  });

  describe("Custom field conditions", () => {
    test("should evaluate custom field equals", () => {
      const cond: Condition = { customField: "Custom.Component", operator: "equals", value: "auth" };
      const story = { ...sampleStory, customFields: { "Custom.Component": "auth" } };
      expect(evaluator.evaluateCondition(cond, story)).toBe(true);
    });

    test("should return false for missing custom field", () => {
      const cond: Condition = { customField: "Custom.Missing", operator: "equals", value: "auth" };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(false);
    });

    test("should evaluate custom field contains", () => {
      const cond: Condition = { customField: "Custom.Complexity", operator: "contains", value: "high" };
      const story = { ...sampleStory, customFields: { "Custom.Complexity": "high-priority" } };
      expect(evaluator.evaluateCondition(cond, story)).toBe(true);
    });
  });

  describe("Edge cases", () => {
    test("should return false for equals when field is undefined", () => {
      const cond: Condition = { field: "customFields.nonExistent", operator: "equals", value: "x" };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(false);
    });

    test("should handle empty array for contains — returns false", () => {
      const story: WorkItem = { ...sampleStory, tags: [] };
      expect(evaluator.evaluateCondition({ field: "tags", operator: "contains", value: "backend" }, story)).toBe(false);
    });

    test("should handle empty array for not-contains — returns true", () => {
      const story: WorkItem = { ...sampleStory, tags: [] };
      expect(evaluator.evaluateCondition({ field: "tags", operator: "not-contains", value: "backend" }, story)).toBe(true);
    });

    test("should handle zero estimation with equals", () => {
      const story: WorkItem = { ...sampleStory, estimation: 0 };
      expect(evaluator.evaluateCondition({ field: "estimation", operator: "equals", value: 0 }, story)).toBe(true);
    });

    test("should handle numeric comparison with string value", () => {
      expect(evaluator.evaluateCondition({ field: "estimation", operator: "equals", value: "13" }, sampleStory)).toBe(true);
    });
  });

  describe("Real-world scenarios", () => {
    test("should evaluate security-related condition", () => {
      const cond: Condition = {
        all: [
          { field: "tags", operator: "contains", value: "security" },
          { field: "priority", operator: "lte", value: 2 },
        ],
      };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(true);
    });

    test("should evaluate database requirement with custom field", () => {
      const cond: Condition = { customField: "Custom.NeedsDatabase", operator: "equals", value: true };
      const story = { ...sampleStory, customFields: { "Custom.NeedsDatabase": true } };
      expect(evaluator.evaluateCondition(cond, story)).toBe(true);
    });

    test("should evaluate high complexity condition", () => {
      const cond: Condition = {
        all: [
          { customField: "Custom.Complexity", operator: "equals", value: "high" },
          { field: "estimation", operator: "gt", value: 8 },
        ],
      };
      const story = { ...sampleStory, customFields: { "Custom.Complexity": "high" } };
      expect(evaluator.evaluateCondition(cond, story)).toBe(true);
    });

    test("should skip frontend-only tasks", () => {
      const cond: Condition = {
        all: [
          { field: "tags", operator: "contains", value: "frontend" },
          { field: "tags", operator: "contains", value: "backend" },
        ],
      };
      expect(evaluator.evaluateCondition(cond, sampleStory)).toBe(false);
    });
  });
});

describe("extractCustomFieldRefs", () => {
  test("should extract custom field from simple clause", () => {
    const cond: Condition = { customField: "Custom.ClientTier", operator: "equals", value: "Enterprise" };
    expect(extractCustomFieldRefs(cond)).toEqual(["Custom.ClientTier"]);
  });

  test("should return empty array for field clause", () => {
    const cond: Condition = { field: "tags", operator: "contains", value: "backend" };
    expect(extractCustomFieldRefs(cond)).toEqual([]);
  });

  test("should extract refs from all compound", () => {
    const cond: Condition = {
      all: [
        { customField: "Custom.A", operator: "equals", value: "x" },
        { field: "tags", operator: "contains", value: "backend" },
        { customField: "Custom.B", operator: "equals", value: "y" },
      ],
    };
    expect(extractCustomFieldRefs(cond)).toEqual(["Custom.A", "Custom.B"]);
  });

  test("should deduplicate refs", () => {
    const cond: Condition = {
      any: [
        { customField: "Custom.Tier", operator: "equals", value: "Gold" },
        { customField: "Custom.Tier", operator: "equals", value: "Platinum" },
      ],
    };
    expect(extractCustomFieldRefs(cond)).toEqual(["Custom.Tier"]);
  });

  test("should extract from nested compound", () => {
    const cond: Condition = {
      all: [
        { any: [{ customField: "Custom.X", operator: "equals", value: 1 }] },
        { customField: "Custom.Y", operator: "equals", value: 2 },
      ],
    };
    expect(extractCustomFieldRefs(cond)).toEqual(["Custom.X", "Custom.Y"]);
  });
});
