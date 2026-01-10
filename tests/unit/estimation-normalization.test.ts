import { describe, expect, test } from "bun:test";
import type { TaskDefinition } from "@templates/schema";
import { normalizeEstimations } from "@/cli/commands/template/template-wizard";

describe("normalizeEstimations", () => {
  test("should handle empty array", () => {
    const tasks: TaskDefinition[] = [];
    normalizeEstimations(tasks);
    expect(tasks).toEqual([]);
  });

  test("should set single task to 100%", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 50 },
    ];

    normalizeEstimations(tasks);
    expect(tasks[0]?.estimationPercent).toBe(100);
  });

  test("should distribute equally when total is zero", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 0 },
      { title: "Task 2", estimationPercent: 0 },
      { title: "Task 3", estimationPercent: 0 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);

    // Should distribute as evenly as possible: 34, 33, 33
    expect(tasks[0]?.estimationPercent).toBe(34);
    expect(tasks[1]?.estimationPercent).toBe(33);
    expect(tasks[2]?.estimationPercent).toBe(33);
  });

  test("should scale proportionally to 100%", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 20 },
      { title: "Task 2", estimationPercent: 30 },
      { title: "Task 3", estimationPercent: 50 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);

    // Should maintain proportions: 20%, 30%, 50% already sum to 100%
    expect(tasks[0]?.estimationPercent).toBe(20);
    expect(tasks[1]?.estimationPercent).toBe(30);
    expect(tasks[2]?.estimationPercent).toBe(50);
  });

  test("should handle scaling from different total", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 10 },
      { title: "Task 2", estimationPercent: 20 },
      { title: "Task 3", estimationPercent: 30 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);

    // Should scale 10:20:30 (60 total) to approximately 17:33:50
    expect(tasks[0]?.estimationPercent).toBeGreaterThanOrEqual(16);
    expect(tasks[0]?.estimationPercent).toBeLessThanOrEqual(17);
    expect(tasks[1]?.estimationPercent).toBeGreaterThanOrEqual(33);
    expect(tasks[1]?.estimationPercent).toBeLessThanOrEqual(34);
    expect(tasks[2]?.estimationPercent).toBeGreaterThanOrEqual(49);
    expect(tasks[2]?.estimationPercent).toBeLessThanOrEqual(51);
  });

  test("should handle rounding edge case with many tasks", () => {
    const tasks: TaskDefinition[] = Array.from({ length: 7 }, (_, i) => ({
      title: `Task ${i + 1}`,
      estimationPercent: 14, // 7 * 14 = 98
    }));

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should handle decimal percentages", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 33.33 },
      { title: "Task 2", estimationPercent: 33.33 },
      { title: "Task 3", estimationPercent: 33.33 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should handle tasks with undefined estimation", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1" }, // undefined
      { title: "Task 2", estimationPercent: 50 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should handle very small percentages", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 0.1 },
      { title: "Task 2", estimationPercent: 0.2 },
      { title: "Task 3", estimationPercent: 0.3 },
    ];

    normalizeEstimations(tasks);

    const total = tasks.reduce((sum, t) => sum + (t.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should give last task the remainder", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 25 },
      { title: "Task 2", estimationPercent: 25 },
      { title: "Task 3", estimationPercent: 25 },
      { title: "Task 4", estimationPercent: 25 },
    ];

    normalizeEstimations(tasks);

    // Should be exactly [25, 25, 25, 25] since they already sum to 100
    expect(tasks.map((t) => t.estimationPercent)).toEqual([25, 25, 25, 25]);
  });

  test("should preserve relative proportions", () => {
    const tasks: TaskDefinition[] = [
      { title: "Task 1", estimationPercent: 1 },
      { title: "Task 2", estimationPercent: 2 },
      { title: "Task 3", estimationPercent: 3 },
    ];

    normalizeEstimations(tasks);

    // Should maintain 1:2:3 ratio, approximately 17:33:50
    const ratios = tasks.map((t) => t.estimationPercent ?? 0);
    expect(ratios.length).toBe(3);
    expect(ratios[0]).toBeDefined();
    expect(ratios[1]).toBeDefined();
    expect(ratios[2]).toBeDefined();
    //biome-ignore lint/style : Checking relative sizes
    expect(ratios[0]).toBeLessThan(ratios[1]!);
    //biome-ignore lint/style : Checking relative sizes
    expect(ratios[1]).toBeLessThan(ratios[2]!);
  });
});
