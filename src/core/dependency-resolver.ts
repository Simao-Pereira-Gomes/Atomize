import { CircularDependencyError } from "@/utils/errors.js";
import { detectCycles, formatCyclePath } from "@/utils/graph.js";
import { logger } from "../config/logger.js";
import type { TaskDefinition } from "../templates/schema.js";

/**
 * Resolves task dependencies and provides topological ordering
 */
export class DependencyResolver {
  /**
   * Performs topological sort on tasks based on their dependencies
   * @param tasks - Array of tasks to sort
   * @returns Tasks ordered such that dependencies come before dependents
   * @throws CircularDependencyError if circular dependencies are detected
   */
  public resolveDependencies(tasks: TaskDefinition[]): TaskDefinition[] {
    const tasksWithIds: TaskDefinition[] = [];
    const tasksWithoutIds: TaskDefinition[] = [];

    for (const task of tasks) {
      if (task.id) {
        tasksWithIds.push(task);
      } else {
        tasksWithoutIds.push(task);
      }
    }

    const taskMap = new Map<string, TaskDefinition>();
    for (const task of tasksWithIds) {
      if (task.id) {
        taskMap.set(task.id, task);
      }
    }

    const graph = this.buildDependencyGraph(tasksWithIds);
    const sorted = this.topologicalSort(graph, taskMap);
    sorted.push(...tasksWithoutIds);

    logger.debug(
      `Resolved task dependencies. Order: ${sorted
        .map((t) => t.title)
        .join(" -> ")}`
    );

    return sorted;
  }

  /**
   * Builds a dependency graph from tasks
   * Returns a map of task ID to its dependencies
   */
  private buildDependencyGraph(
    tasks: TaskDefinition[]
  ): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    for (const task of tasks) {
      if (!task.id) continue;

      // Initialize node
      if (!graph.has(task.id)) {
        graph.set(task.id, new Set());
      }

      // Add dependencies
      if (task.dependsOn && task.dependsOn.length > 0) {
        const deps = graph.get(task.id);
        for (const depId of task.dependsOn) {
          deps?.add(depId);
          // Ensure dependency node exists in graph
          if (!graph.has(depId)) {
            graph.set(depId, new Set());
          }
        }
      }
    }

    return graph;
  }

  /**
   * Performs topological sort using Kahn's algorithm
   */
  private topologicalSort(
    graph: Map<string, Set<string>>,
    taskMap: Map<string, TaskDefinition>
  ): TaskDefinition[] {
    const result: TaskDefinition[] = [];

    const inDegree = new Map<string, number>();
    for (const [nodeId, deps] of graph.entries()) {
      if (!inDegree.has(nodeId)) {
        inDegree.set(nodeId, 0);
      }
      for (const dep of deps) {
        inDegree.set(dep, inDegree.get(dep) || 0);
        inDegree.set(nodeId, (inDegree.get(nodeId) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId) continue;
      visited.add(nodeId);

      const task = taskMap.get(nodeId);
      if (task) {
        result.push(task);
      }

      // Find all tasks that depend on this node
      for (const [otherId, deps] of graph.entries()) {
        if (deps.has(nodeId)) {
          // Remove this dependency
          deps.delete(nodeId);
          // Decrease in-degree
          const degree = inDegree.get(otherId) || 0;
          inDegree.set(otherId, degree - 1);

          // If in-degree is now 0, add to queue
          if (inDegree.get(otherId) === 0 && !visited.has(otherId)) {
            queue.push(otherId);
          }
        }
      }
    }

    // Check if all nodes were visited (if not, there's a cycle)
    if (visited.size !== graph.size) {
      // Convert graph to adjacency list format for shared utility
      const adjacencyList = new Map<string, string[]>();
      for (const [nodeId, deps] of graph.entries()) {
        adjacencyList.set(nodeId, Array.from(deps));
      }

      const { cycles } = detectCycles(adjacencyList);
      const cycle = cycles[0] ?? [];
      const cycleDisplay = formatCyclePath(cycle);
      const suggestion = `Break the circular dependency by removing one of these dependencies: ${cycle
        .map((id, i) => (i < cycle.length - 1 ? `"${id}" depends on "${cycle[i + 1]}"` : ""))
        .filter(Boolean)
        .join(", ")}`;
      throw new CircularDependencyError(
        `Circular dependency detected: ${cycleDisplay}. ${suggestion}`,
        cycle
      );
    }

    return result;
  }

  /**
   * Creates a dependency map showing which tasks depend on each task
   * Useful for creating platform links
   */
  public buildDependencyMap(
    tasks: TaskDefinition[]
  ): Map<string, TaskDefinition[]> {
    const dependencyMap = new Map<string, TaskDefinition[]>();

    for (const task of tasks) {
      if (task.dependsOn && task.dependsOn.length > 0) {
        for (const depId of task.dependsOn) {
          if (!dependencyMap.has(depId)) {
            dependencyMap.set(depId, []);
          }
          dependencyMap.get(depId)?.push(task);
        }
      }
    }

    return dependencyMap;
  }

  /**
   * Validates that all task dependencies exist
   * @returns Array of error messages for invalid dependencies
   */
  public validateDependencies(tasks: TaskDefinition[]): string[] {
    const errors: string[] = [];
    const taskIds = new Set(tasks.map((t) => t.id).filter((id) => id));
    const availableIds = Array.from(taskIds);

    for (const task of tasks) {
      if (task.dependsOn && task.dependsOn.length > 0) {
        for (const depId of task.dependsOn) {
          if (!taskIds.has(depId)) {
            const suggestion = availableIds.length > 0
              ? ` Available task IDs: ${availableIds.map(id => `"${id}"`).join(", ")}`
              : " Add an 'id' field to the task you want to depend on.";
            errors.push(
              `Task "${task.title}" (ID: ${task.id}) depends on non-existent task ID: "${depId}".${suggestion}`
            );
          }
        }
      }
    }

    return errors;
  }
}
