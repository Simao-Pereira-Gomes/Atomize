import { describe, expect, test } from "bun:test";
import { ConditionEvaluator } from "../../src/core/condition-evaluator";
import type { WorkItem } from "../../src/platforms/interfaces/work-item.interface";

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

  describe("Empty and invalid conditions", () => {
    test("should return true for empty condition", () => {
      expect(evaluator.evaluateCondition("", sampleStory)).toBe(true);
    });

    test("should return true for undefined condition", () => {
      expect(
        evaluator.evaluateCondition(undefined as unknown as string, sampleStory)
      ).toBe(true);
    });

    test("should handle malformed variable expressions", () => {
      expect(evaluator.evaluateCondition("${invalidVar", sampleStory)).toBe(
        true
      );
    });
  });

  describe("CONTAINS operator", () => {
    test("should evaluate CONTAINS with tags array", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.tags} CONTAINS "backend"',
          sampleStory
        )
      ).toBe(true);
    });

    test("should evaluate CONTAINS case-insensitively", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.tags} CONTAINS "BACKEND"',
          sampleStory
        )
      ).toBe(true);
    });

    test("should return false when tag not found", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.tags} CONTAINS "frontend"',
          sampleStory
        )
      ).toBe(false);
    });

    test("should evaluate CONTAINS with title", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.title} CONTAINS "Authentication"',
          sampleStory
        )
      ).toBe(true);
    });
  });

  describe("Equality operators (==, !=)", () => {
    test("should evaluate == with numbers", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation} == 13", sampleStory)
      ).toBe(true);
    });

    test("should evaluate == with strings", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition('${story.state} == "Active"', sampleStory)
      ).toBe(true);
    });

    test("should evaluate != with numbers", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation} != 8", sampleStory)
      ).toBe(true);
    });

    test("should evaluate != with strings", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition('${story.state} != "Closed"', sampleStory)
      ).toBe(true);
    });

    test("should handle custom fields", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.customFields.component} == "auth"',
          sampleStory
        )
      ).toBe(true);
    });

    test("should evaluate boolean custom fields", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          "${story.customFields.needsDatabase} == true",
          sampleStory
        )
      ).toBe(true);
    });
  });

  describe("Comparison operators (>, <, >=, <=)", () => {
    test("should evaluate > operator", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation} > 10", sampleStory)
      ).toBe(true);
    });

    test("should evaluate < operator", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation} < 5", sampleStory)
      ).toBe(false);
    });

    test("should evaluate >= operator", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation} >= 13", sampleStory)
      ).toBe(true);
    });

    test("should evaluate <= operator", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation} <= 20", sampleStory)
      ).toBe(true);
    });

    test("should evaluate priority with > operator", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.priority} > 0", sampleStory)
      ).toBe(true);
    });
  });

  describe("Logical operators (AND, OR)", () => {
    test("should evaluate AND with both true", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.tags} CONTAINS "backend" AND ${story.estimation} > 10',
          sampleStory
        )
      ).toBe(true);
    });

    test("should evaluate AND with one false", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.tags} CONTAINS "backend" AND ${story.estimation} < 5',
          sampleStory
        )
      ).toBe(false);
    });

    test("should evaluate OR with one true", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.tags} CONTAINS "frontend" OR ${story.tags} CONTAINS "backend"',
          sampleStory
        )
      ).toBe(true);
    });

    test("should evaluate OR with both false", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.tags} CONTAINS "frontend" OR ${story.tags} CONTAINS "mobile"',
          sampleStory
        )
      ).toBe(false);
    });

    test("should evaluate complex AND/OR expression", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.tags} CONTAINS "backend" AND ${story.estimation} > 5 OR ${story.priority} == 1',
          sampleStory
        )
      ).toBe(true);
    });
  });

  describe("Truthiness evaluation", () => {
    test("should evaluate true literal", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          "${story.customFields.needsDatabase}",
          sampleStory
        )
      ).toBe(true);
    });

    test("should return false for undefined variables", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          "${story.customFields.nonExistent}",
          sampleStory
        )
      ).toBe(false);
    });

    test("should evaluate non-empty strings as true", () => {
      const story: WorkItem = {
        ...sampleStory,
        customFields: { flag: "yes" },
      };
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.customFields.flag}", story)
      ).toBe(true);
    });
  });

  describe("Variable path resolution", () => {
    test("should resolve story.title", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.title} CONTAINS "Authentication"',
          sampleStory
        )
      ).toBe(true);
    });

    test("should resolve nested custom fields", () => {
      const story: WorkItem = {
        ...sampleStory,
        customFields: {
          nested: {
            value: "test",
          },
        },
      };
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.customFields.nested} CONTAINS "test"',
          story
        )
      ).toBe(true);
    });

    test("should handle missing nested paths", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          "${story.customFields.missing.path}",
          sampleStory
        )
      ).toBe(false);
    });

    test("should work without story. prefix", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition('${tags} CONTAINS "backend"', sampleStory)
      ).toBe(true);
    });
  });

  describe("Edge cases", () => {
    test("should handle quotes in strings", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          "${story.title} CONTAINS 'Authentication'",
          sampleStory
        )
      ).toBe(true);
    });

    test("should handle condition wrapped in outer quotes (YAML parsing)", () => {
      // When YAML parses: condition: "'${story.estimation} >= 3'"
      // It results in a string with outer single quotes
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          "'${story.estimation} >= 13'",
          sampleStory
        )
      ).toBe(true);
    });

    test("should handle condition wrapped in double quotes (YAML parsing)", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '"${story.estimation} >= 13"',
          sampleStory
        )
      ).toBe(true);
    });

    test("should handle condition with outer quotes and comparison", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          "'${story.estimation} >= 3'",
          sampleStory
        )
      ).toBe(true);

      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          "'${story.estimation} < 3'",
          sampleStory
        )
      ).toBe(false);
    });

    test("should handle empty arrays", () => {
      const story: WorkItem = {
        ...sampleStory,
        tags: [],
      };
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition('${story.tags} CONTAINS "backend"', story)
      ).toBe(false);
    });

    test("should handle null values", () => {
      const story: WorkItem = {
        ...sampleStory,
        description: undefined,
      };
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.description} CONTAINS "test"',
          story
        )
      ).toBe(false);
    });

    test("should handle zero estimation", () => {
      const story: WorkItem = {
        ...sampleStory,
        estimation: 0,
      };
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation} == 0", story)
      ).toBe(true);
    });

    test("should handle operators without spaces", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation}==13", sampleStory)
      ).toBe(true);
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation}!=8", sampleStory)
      ).toBe(true);
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation}>10", sampleStory)
      ).toBe(true);
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation}<20", sampleStory)
      ).toBe(true);
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation}>=13", sampleStory)
      ).toBe(true);
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation}<=13", sampleStory)
      ).toBe(true);
    });

    test("should handle operators with mixed spacing", () => {
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation} ==13", sampleStory)
      ).toBe(true);
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("${story.estimation}!= 8", sampleStory)
      ).toBe(true);
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition('${story.state}!="Closed"', sampleStory)
      ).toBe(true);
    });

    test("should handle YAML condition format without spaces", () => {
      // Test the specific case from the YAML: '${story.state} !=Active'
      // When story.state = "Active", it becomes "Active !=Active" which is false
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("'${story.state} !=Active'", sampleStory)
      ).toBe(false);
      // When story.state = "Active", comparing with "Closed" should be true
      expect(
        // biome-ignore lint/suspicious : We want to test the template interpolation here
        evaluator.evaluateCondition("'${story.state}!=Closed'", sampleStory)
      ).toBe(true);
    });
  });

  describe("Real-world scenarios", () => {
    test("should evaluate security-related condition", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.tags} CONTAINS "security" AND ${story.priority} <= 2',
          sampleStory
        )
      ).toBe(true);
    });

    test("should evaluate database requirement condition", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          "${story.customFields.needsDatabase} == true",
          sampleStory
        )
      ).toBe(true);
    });

    test("should evaluate high complexity condition", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.customFields.complexity} == "high" AND ${story.estimation} > 8',
          sampleStory
        )
      ).toBe(true);
    });

    test("should skip frontend-only tasks", () => {
      expect(
        evaluator.evaluateCondition(
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          '${story.tags} CONTAINS "frontend" AND ${story.tags} CONTAINS "backend"',
          sampleStory
        )
      ).toBe(false);
    });
  });
});
