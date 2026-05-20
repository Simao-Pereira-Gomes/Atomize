import { describe, expect, test } from "bun:test";
import type { TaskDefinition } from "@templates/schema";
import {
  normalizeEstimations,
  showStepHint,
} from "../../src/cli/commands/template/template-wizard";

describe("normalizeEstimations", () => {
  test("should normalize tasks to sum to 100%", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 30 },
      { title: "Task 2", estimationPercent: 20 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should handle single task with 100% estimation", () => {
    const tasks: TaskDefinition[] = [
      { title: "Single Task", estimationPercent: 50 },
    ];

    normalizeEstimations(tasks);

    expect(tasks[0]?.estimationPercent).toBe(100);
  });

  test("should handle multiple tasks with 0% estimation", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 0 },
      { title: "Task 2", estimationPercent: 0 },
      { title: "Task 3", estimationPercent: 0 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);

    // Should distribute evenly: 34, 33, 33
    expect(tasks[0]?.estimationPercent).toBe(34);
    expect(tasks[1]?.estimationPercent).toBe(33);
    expect(tasks[2]?.estimationPercent).toBe(33);
  });

  test("should handle tasks with decimal percentages", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 33.33 },
      { title: "Task 2", estimationPercent: 33.33 },
      { title: "Task 3", estimationPercent: 33.33 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should preserve relative proportions when normalizing", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 10 },
      { title: "Task 2", estimationPercent: 20 },
      { title: "Task 3", estimationPercent: 30 },
    ];

    normalizeEstimations(tasks);

    // Should maintain 1:2:3 ratio approximately
    const [task1, task2, task3] = tasks;
    expect(task1?.estimationPercent).toBeLessThan(
      task2?.estimationPercent || 0
    );
    expect(task2?.estimationPercent).toBeLessThan(
      task3?.estimationPercent || 0
    );
  });

  test("should handle very small estimation values", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 0.1 },
      { title: "Task 2", estimationPercent: 0.2 },
      { title: "Task 3", estimationPercent: 0.3 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should handle mixed zero and non-zero estimations", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 50 },
      { title: "Task 2", estimationPercent: 0 },
      { title: "Task 3", estimationPercent: 0 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);
    expect(tasks[0]?.estimationPercent).toBe(100);
    expect(tasks[1]?.estimationPercent).toBe(0);
    expect(tasks[2]?.estimationPercent).toBe(0);
  });

  test("should always normalize to exactly 100%", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 25 },
      { title: "Task 2", estimationPercent: 25 },
      { title: "Task 3", estimationPercent: 25 },
      { title: "Task 4", estimationPercent: 25 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should handle large number of tasks", () => {
    const tasks: TaskDefinition[] = Array.from({ length: 20 }, (_, i) => ({
      title: `Task ${i + 1}`,
      estimationPercent: 3,
    }));

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });
});

describe("showStepHint", () => {
  test("should not throw for valid step names", () => {
    expect(() => showStepHint("filter")).not.toThrow();
    expect(() => showStepHint("tasks")).not.toThrow();
    expect(() => showStepHint("estimation")).not.toThrow();
    expect(() => showStepHint("validation")).not.toThrow();
    expect(() => showStepHint("metadata")).not.toThrow();
  });

  test("should handle case-insensitive step names", () => {
    expect(() => showStepHint("FILTER")).not.toThrow();
    expect(() => showStepHint("Tasks")).not.toThrow();
  });

  test("should handle unknown step names gracefully", () => {
    expect(() => showStepHint("unknown")).not.toThrow();
    expect(() => showStepHint("")).not.toThrow();
  });
});
