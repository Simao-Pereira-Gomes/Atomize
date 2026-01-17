import { describe, expect, test } from "bun:test";
import { validateTemplate } from "../../src/cli/commands/template/template-create.command";
import type { TaskTemplate } from "@templates/schema";

describe("Template Wizard - Full Flow Integration", () => {
  test("should validate a complete valid template", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Backend API Development",
      description: "Template for backend API development tasks",
      author: "Test User",
      tags: ["backend", "api"],
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
        states: ["New", "Active"],
        excludeIfHasTasks: true,
      },
      tasks: [
        {
          title: "Design API endpoints",
          description: "Design RESTful API endpoints",
          estimationPercent: 20,
        },
        {
          title: "Implement endpoints",
          description: "Implement API endpoints",
          estimationPercent: 40,
        },
        {
          title: "Write tests",
          description: "Write unit and integration tests",
          estimationPercent: 25,
        },
        {
          title: "Documentation",
          description: "Document API endpoints",
          estimationPercent: 15,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "nearest",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("should detect missing template name", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          title: "Task 1",
          estimationPercent: 100,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Template name is required");
  });

  test("should detect template name exceeding max length", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "a".repeat(201),
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          title: "Task 1",
          estimationPercent: 100,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("200 characters"))).toBe(true);
  });

  test("should detect description exceeding max length", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Valid Name",
      description: "a".repeat(501),
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          title: "Task 1",
          estimationPercent: 100,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("500 characters"))).toBe(true);
  });

  test("should detect missing tasks", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Valid Name",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("At least one task is required");
  });

  test("should detect task without title", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Valid Name",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          title: "",
          estimationPercent: 50,
        },
        {
          title: "Valid Task",
          estimationPercent: 50,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("has no title"))).toBe(true);
  });

  test("should detect task title exceeding max length", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Valid Name",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          title: "a".repeat(501),
          estimationPercent: 100,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes("title") && e.includes("500 characters")
      )
    ).toBe(true);
  });

  test("should detect task description exceeding max length", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Valid Name",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          title: "Valid Task",
          description: "a".repeat(2001),
          estimationPercent: 100,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes("description") && e.includes("2000 characters")
      )
    ).toBe(true);
  });

  test("should detect invalid estimation percentage", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Valid Name",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          title: "Task 1",
          estimationPercent: 150,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("estimation must be between 0 and 100"))
    ).toBe(true);
  });

  test("should warn when total estimation is not 100%", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Valid Name",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          title: "Task 1",
          estimationPercent: 50,
        },
        {
          title: "Task 2",
          estimationPercent: 30,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("80%"))).toBe(true);
  });

  test("should warn when filter has no criteria", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Valid Name",
      created: new Date().toISOString(),
      filter: {},
      tasks: [
        {
          title: "Task 1",
          estimationPercent: 100,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(true);
    expect(
      result.warnings.some((w) => w.includes("match all items"))
    ).toBe(true);
  });

  test("should detect invalid task dependency", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Valid Name",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          estimationPercent: 50,
        },
        {
          id: "task-2",
          title: "Task 2",
          estimationPercent: 50,
          dependsOn: ["task-999"],
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("depends on non-existent task"))
    ).toBe(true);
  });

  test("should validate template with special characters", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Template: Backend & Frontend (API)",
      description: "Development template with special chars: !@#$%^&*()",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          title: "Task with special chars: <script>alert('test')</script>",
          description: "Description with quotes: \"double\" and 'single'",
          estimationPercent: 100,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    // Should be valid - special characters are allowed
    expect(result.valid).toBe(true);
  });

  test("should validate template with unicode characters", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Template 模板 🚀",
      description: "Template with unicode: 你好世界 emoji: 😀",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          title: "タスク 1",
          description: "日本語の説明",
          estimationPercent: 100,
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(true);
  });

  test("should validate template with valid task dependencies", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Valid Name",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          estimationPercent: 33,
        },
        {
          id: "task-2",
          title: "Task 2",
          estimationPercent: 33,
          dependsOn: ["task-1"],
        },
        {
          id: "task-3",
          title: "Task 3",
          estimationPercent: 34,
          dependsOn: ["task-1", "task-2"],
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("should handle maximum task count", () => {
    const tasks = Array.from({ length: 50 }, (_, i) => ({
      title: `Task ${i + 1}`,
      estimationPercent: 2,
    }));

    const template: TaskTemplate = {
      version: "1.0",
      name: "Large Template",
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story"],
      },
      tasks,
      estimation: {
        strategy: "percentage",
        rounding: "none",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(true);
  });

  test("should validate template with all optional fields", () => {
    const template: TaskTemplate = {
      version: "1.0",
      name: "Complete Template",
      description: "A complete template with all fields",
      author: "Test Author",
      tags: ["tag1", "tag2", "tag3"],
      created: new Date().toISOString(),
      filter: {
        workItemTypes: ["User Story", "Bug"],
        states: ["New", "Active"],
        excludeIfHasTasks: true,
        areaPaths: ["Area1", "Area2"],
        iterations: ["Sprint 1"],
        assignedTo: ["user@example.com"],
        priority: { min: 1, max: 3 },
        tags: {
          include: ["backend"],
          exclude: ["frontend"],
        },
      },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          description: "Task description",
          estimationPercent: 50,
          assignTo: "@ParentAssignee",
          activity: "Development",
          acceptanceCriteria: ["Criterion 1", "Criterion 2"],
          acceptanceCriteriaAsChecklist: true,
          tags: ["backend", "api"],
          priority: 2,
          remainingWork: 8,
        },
        {
          id: "task-2",
          title: "Task 2",
          estimationPercent: 50,
          dependsOn: ["task-1"],
          condition: "${story.tags CONTAINS 'backend'}",
        },
      ],
      estimation: {
        strategy: "percentage",
        rounding: "nearest",
        minimumTaskPoints: 1,
      },
      validation: {
        totalEstimationMustBe: 100,
        minTasks: 2,
        maxTasks: 10,
      },
      metadata: {
        category: "Backend Development",
        difficulty: "intermediate",
        recommendedFor: ["Backend", "Full Stack"],
        estimationGuidelines: "Use story points based on complexity",
      },
    };

    const result = validateTemplate(template);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
