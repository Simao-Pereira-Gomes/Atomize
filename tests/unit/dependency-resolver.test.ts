import { describe, expect, test } from "bun:test";
import { CircularDependencyError } from "@utils/errors";
import { DependencyResolver } from "../../src/core/dependency-resolver";
import type { TaskDefinition } from "../../src/templates/schema";

describe("DependencyResolver", () => {
  const resolver = new DependencyResolver();

  describe("Simple dependency resolution", () => {
    test("should order tasks with linear dependencies", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "task3",
          title: "Test",
          estimationPercent: 20,
          dependsOn: ["task2"],
        },
        {
          id: "task1",
          title: "Design",
          estimationPercent: 30,
        },
        {
          id: "task2",
          title: "Implement",
          estimationPercent: 50,
          dependsOn: ["task1"],
        },
      ];

      const ordered = resolver.resolveDependencies(tasks);

      expect(ordered[0]?.id).toBe("task1");
      expect(ordered[1]?.id).toBe("task2");
      expect(ordered[2]?.id).toBe("task3");
    });

    test("should handle tasks without dependencies", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "task1",
          title: "Task 1",
          estimationPercent: 50,
        },
        {
          id: "task2",
          title: "Task 2",
          estimationPercent: 50,
        },
      ];

      const ordered = resolver.resolveDependencies(tasks);

      expect(ordered.length).toBe(2);
      // Order doesn't matter since there are no dependencies
    });

    test("should handle empty task array", () => {
      const tasks: TaskDefinition[] = [];
      const ordered = resolver.resolveDependencies(tasks);
      expect(ordered.length).toBe(0);
    });
  });

  describe("Complex dependency graphs", () => {
    test("should resolve diamond dependency pattern", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "taskA",
          title: "Task A",
          estimationPercent: 25,
        },
        {
          id: "taskB",
          title: "Task B",
          estimationPercent: 25,
          dependsOn: ["taskA"],
        },
        {
          id: "taskC",
          title: "Task C",
          estimationPercent: 25,
          dependsOn: ["taskA"],
        },
        {
          id: "taskD",
          title: "Task D",
          estimationPercent: 25,
          dependsOn: ["taskB", "taskC"],
        },
      ];

      const ordered = resolver.resolveDependencies(tasks);

      expect(ordered[0]?.id).toBe("taskA");
      // TaskB and TaskC must come before TaskD
      const taskDIndex = ordered.findIndex((t) => t.id === "taskD");
      const taskBIndex = ordered.findIndex((t) => t.id === "taskB");
      const taskCIndex = ordered.findIndex((t) => t.id === "taskC");

      expect(taskBIndex).toBeLessThan(taskDIndex);
      expect(taskCIndex).toBeLessThan(taskDIndex);
    });

    test("should handle multiple dependency chains", () => {
      const tasks: TaskDefinition[] = [
        { id: "task1", title: "Task 1", estimationPercent: 20 },
        {
          id: "task2",
          title: "Task 2",
          estimationPercent: 20,
          dependsOn: ["task1"],
        },
        { id: "task3", title: "Task 3", estimationPercent: 20 },
        {
          id: "task4",
          title: "Task 4",
          estimationPercent: 20,
          dependsOn: ["task3"],
        },
        {
          id: "task5",
          title: "Task 5",
          estimationPercent: 20,
          dependsOn: ["task2", "task4"],
        },
      ];

      const ordered = resolver.resolveDependencies(tasks);

      // Verify task5 comes after both task2 and task4
      const task5Index = ordered.findIndex((t) => t.id === "task5");
      const task2Index = ordered.findIndex((t) => t.id === "task2");
      const task4Index = ordered.findIndex((t) => t.id === "task4");

      expect(task2Index).toBeLessThan(task5Index);
      expect(task4Index).toBeLessThan(task5Index);
    });
  });

  describe("Circular dependency detection", () => {
    test("should detect simple circular dependency", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "task1",
          title: "Task 1",
          estimationPercent: 50,
          dependsOn: ["task2"],
        },
        {
          id: "task2",
          title: "Task 2",
          estimationPercent: 50,
          dependsOn: ["task1"],
        },
      ];

      expect(() => resolver.resolveDependencies(tasks)).toThrow(
        CircularDependencyError
      );
    });

    test("should detect three-way circular dependency", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "task1",
          title: "Task 1",
          estimationPercent: 33,
          dependsOn: ["task3"],
        },
        {
          id: "task2",
          title: "Task 2",
          estimationPercent: 33,
          dependsOn: ["task1"],
        },
        {
          id: "task3",
          title: "Task 3",
          estimationPercent: 34,
          dependsOn: ["task2"],
        },
      ];

      expect(() => resolver.resolveDependencies(tasks)).toThrow(
        CircularDependencyError
      );
    });

    test("should detect complex circular dependency", () => {
      const tasks: TaskDefinition[] = [
        { id: "task1", title: "Task 1", estimationPercent: 25 },
        {
          id: "task2",
          title: "Task 2",
          estimationPercent: 25,
          dependsOn: ["task1"],
        },
        {
          id: "task3",
          title: "Task 3",
          estimationPercent: 25,
          dependsOn: ["task2"],
        },
        {
          id: "task4",
          title: "Task 4",
          estimationPercent: 25,
          dependsOn: ["task3", "task2"],
        },
        {
          // This creates a cycle: task2 -> task3 -> task4 -> task5 -> task2
          id: "task5",
          title: "Task 5",
          estimationPercent: 25,
          dependsOn: ["task4"],
        },
      ];

      if (tasks[1]) {
        tasks[1].dependsOn = ["task1", "task5"];
      }

      expect(() => resolver.resolveDependencies(tasks)).toThrow(
        CircularDependencyError
      );
    });
  });

  describe("Dependency validation", () => {
    test("should validate all dependencies exist", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "task1",
          title: "Task 1",
          estimationPercent: 50,
          dependsOn: ["nonExistentTask"],
        },
        {
          id: "task2",
          title: "Task 2",
          estimationPercent: 50,
        },
      ];

      const errors = resolver.validateDependencies(tasks);

      expect(errors.length).toBe(1);
      expect(errors[0]).toContain("nonExistentTask");
    });

    test("should return empty array for valid dependencies", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "task1",
          title: "Task 1",
          estimationPercent: 50,
        },
        {
          id: "task2",
          title: "Task 2",
          estimationPercent: 50,
          dependsOn: ["task1"],
        },
      ];

      const errors = resolver.validateDependencies(tasks);

      expect(errors.length).toBe(0);
    });

    test("should detect multiple invalid dependencies", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "task1",
          title: "Task 1",
          estimationPercent: 50,
          dependsOn: ["missing1", "missing2"],
        },
      ];

      const errors = resolver.validateDependencies(tasks);

      expect(errors.length).toBe(2);
    });
  });

  describe("Dependency map building", () => {
    test("should build dependency map correctly", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "task1",
          title: "Task 1",
          estimationPercent: 50,
        },
        {
          id: "task2",
          title: "Task 2",
          estimationPercent: 25,
          dependsOn: ["task1"],
        },
        {
          id: "task3",
          title: "Task 3",
          estimationPercent: 25,
          dependsOn: ["task1"],
        },
      ];

      const depMap = resolver.buildDependencyMap(tasks);

      expect(depMap.get("task1")?.length).toBe(2);
      expect(depMap.get("task1")?.[0]?.id).toBe("task2");
      expect(depMap.get("task1")?.[1]?.id).toBe("task3");
    });

    test("should return empty map for tasks without dependencies", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "task1",
          title: "Task 1",
          estimationPercent: 100,
        },
      ];

      const depMap = resolver.buildDependencyMap(tasks);

      expect(depMap.size).toBe(0);
    });
  });

  describe("Tasks without IDs", () => {
    test("should handle tasks without IDs", () => {
      const tasks: TaskDefinition[] = [
        {
          title: "Task without ID",
          estimationPercent: 50,
        },
        {
          id: "task2",
          title: "Task with ID",
          estimationPercent: 50,
        },
      ];

      const ordered = resolver.resolveDependencies(tasks);

      expect(ordered.length).toBe(2);
    });

    test("should place tasks without IDs at the end", () => {
      const tasks: TaskDefinition[] = [
        {
          title: "No ID Task",
          estimationPercent: 33,
        },
        {
          id: "task1",
          title: "Task 1",
          estimationPercent: 33,
        },
        {
          id: "task2",
          title: "Task 2",
          estimationPercent: 34,
          dependsOn: ["task1"],
        },
      ];

      const ordered = resolver.resolveDependencies(tasks);

      expect(ordered[0]?.id).toBe("task1");
      expect(ordered[1]?.id).toBe("task2");
      expect(ordered[2]?.id).toBeUndefined();
    });
  });

  describe("Real-world scenarios", () => {
    test("should handle typical development workflow", () => {
      const tasks: TaskDefinition[] = [
        {
          id: "design",
          title: "Design UI mockups",
          estimationPercent: 10,
        },
        {
          id: "implement",
          title: "Implement feature",
          estimationPercent: 50,
          dependsOn: ["design"],
        },
        {
          id: "unit-test",
          title: "Write unit tests",
          estimationPercent: 20,
          dependsOn: ["implement"],
        },
        {
          id: "integration-test",
          title: "Write integration tests",
          estimationPercent: 15,
          dependsOn: ["implement"],
        },
        {
          id: "deploy",
          title: "Deploy to staging",
          estimationPercent: 5,
          dependsOn: ["unit-test", "integration-test"],
        },
      ];

      const ordered = resolver.resolveDependencies(tasks);

      // Design should be first
      expect(ordered[0]?.id).toBe("design");

      // Implement should come after design
      const designIndex = ordered.findIndex((t) => t.id === "design");
      const implementIndex = ordered.findIndex((t) => t.id === "implement");
      expect(implementIndex).toBeGreaterThan(designIndex);
      expect(ordered[ordered.length - 1]?.id).toBe("deploy");
    });
  });
});
