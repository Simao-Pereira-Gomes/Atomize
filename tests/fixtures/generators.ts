import type { TaskDefinition } from "../../src/templates/schema";

interface GeneratorOptions {
  withDependencies?: boolean;
  withConditions?: boolean;
  withCustomFields?: boolean;
  withDeepChain?: boolean;
  withDiamondPattern?: boolean;
}

export function generateLargeTemplate(
  taskCount: number,
  options: GeneratorOptions = {},
) {
  const tasks: TaskDefinition[] = [];
  const estimationPerTask = Math.floor(100 / taskCount);
  const remainder = 100 - estimationPerTask * taskCount;

  for (let i = 0; i < taskCount; i++) {
    const task: TaskDefinition = {
      id: `task-${i}`,
      title: `Task ${i}: Performance Test Title`,
      estimationPercent:
        i === taskCount - 1 ? estimationPerTask + remainder : estimationPerTask,
    };

    if (options.withDeepChain && i > 0) {
      // Each task depends on the previous one (linear chain)
      task.dependsOn = [`task-${i - 1}`];
    } else if (options.withDiamondPattern && i > 0) {
      // Diamond pattern: tasks depend on multiple previous tasks
      task.dependsOn = [];
      const depsCount = Math.min(3, i);
      for (let d = 1; d <= depsCount; d++) {
        task.dependsOn.push(`task-${i - d}`);
      }
    } else if (options.withDependencies && i > 0) {
      const depCount = Math.min(i, Math.floor(Math.random() * 3) + 1);
      task.dependsOn = [];
      for (let d = 0; d < depCount; d++) {
        const depIndex = Math.max(0, i - d - 1);
        task.dependsOn.push(`task-${depIndex}`);
      }
    }

    if (options.withConditions && i % 3 === 0) {
      task.condition = `\${story.tags} CONTAINS 'feature-${i}'`;
    }

    if (i % 2 === 0) {
      task.acceptanceCriteria = [
        `Criteria 1 for task ${i}`,
        `Criteria 2 for task ${i}`,
      ];
    }

    tasks.push(task);
  }

  return {
    version: "1.0",
    name: `Large Template ${taskCount}`,
    filter: {
      workItemTypes: ["User Story"],
      states: ["New", "Active"],
      customFields: options.withCustomFields
        ? [
            {
              field: "Custom.Priority",
              operator: "equals" as const,
              value: "High",
            },
          ]
        : undefined,
    },
    tasks,
    validation: { totalEstimationMustBe: 100 },
  };
}

/**
 * Generates a template with circular dependencies for testing cycle detection.
 * Creates multiple independent cycles of specified size.
 */
export function generateTemplateWithCycles(
  taskCount: number,
  cycleSize: number = 3,
) {
  const tasks: TaskDefinition[] = [];
  const estimationPerTask = Math.floor(100 / taskCount);
  const remainder = 100 - estimationPerTask * taskCount;

  for (let i = 0; i < taskCount; i++) {
    const task: TaskDefinition = {
      id: `task-${i}`,
      title: `Task ${i}: Cycle Test`,
      estimationPercent:
        i === taskCount - 1 ? estimationPerTask + remainder : estimationPerTask,
    };

    const cycleGroup = Math.floor(i / cycleSize);
    const posInCycle = i % cycleSize;
    const cycleStart = cycleGroup * cycleSize;

    const nextInCycle = cycleStart + ((posInCycle + 1) % cycleSize);
    if (nextInCycle < taskCount) {
      task.dependsOn = [`task-${nextInCycle}`];
    }

    tasks.push(task);
  }

  return {
    version: "1.0",
    name: `Cyclic Template ${taskCount}`,
    filter: { workItemTypes: ["User Story"] },
    tasks,
  };
}
