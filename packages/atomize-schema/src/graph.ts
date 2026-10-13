/**
 * Graph utilities for dependency analysis
 */

export interface CycleDetectionResult {
  hasCycles: boolean;
  cycles: string[][];
}

/**
 * Detects all cycles in a directed graph using DFS.
 *
 * @param adjacencyList - Map of node ID to array of dependency IDs
 * @returns Object containing whether cycles exist and all detected cycle paths
 */
export function detectCycles(
  adjacencyList: Map<string, string[]>,
): CycleDetectionResult {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const reportedCycles = new Set<string>();
  const cycles: string[][] = [];

  function dfs(nodeId: string, path: string[]): void {
    if (inStack.has(nodeId)) {
      // Found a cycle - extract the cycle portion from path
      const cycleStart = path.indexOf(nodeId);
      const cyclePath = [...path.slice(cycleStart), nodeId];
      const cycleKey = [...cyclePath].sort().join(",");

      // Only report each unique cycle once
      if (!reportedCycles.has(cycleKey)) {
        reportedCycles.add(cycleKey);
        cycles.push(cyclePath);
      }
      return;
    }

    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    const dependencies = adjacencyList.get(nodeId) ?? [];
    for (const depId of dependencies) {
      // Only traverse if the dependency exists in the graph
      if (adjacencyList.has(depId)) {
        dfs(depId, path);
      }
    }

    path.pop();
    inStack.delete(nodeId);
  }

  // Run DFS from each node to detect all cycles
  for (const nodeId of adjacencyList.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, []);
    }
  }

  return {
    hasCycles: cycles.length > 0,
    cycles,
  };
}

/**
 * Builds an adjacency list from tasks with dependencies.
 *
 * @param tasks - Array of objects with optional id and dependsOn fields
 * @returns Map of task ID to array of dependency IDs
 */
export function buildAdjacencyList(
  tasks: Array<{ id?: string; dependsOn?: string[] }>,
): Map<string, string[]> {
  const adjacencyList = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.id) {
      adjacencyList.set(task.id, task.dependsOn ?? []);
    }
  }
  return adjacencyList;
}

/**
 * Formats a cycle path for display.
 *
 * @param cyclePath - Array of node IDs in the cycle
 * @returns Formatted string like "a" → "b" → "c" → "a"
 */
export function formatCyclePath(cyclePath: string[]): string {
  return cyclePath.map((id) => `"${id}"`).join(" → ");
}

/** Shared dependency order: the last Task receives normalization's rounding remainder. */
export function orderTaskDefinitions<T extends { id?: string; dependsOn?: string[] }>(tasks: readonly T[]): T[] | undefined {
  const byId = new Map<string, T>();
  const graph = new Map<string, Set<string>>();
  for (const task of tasks) {
    if (!task.id) continue;
    byId.set(task.id, task);
    if (!graph.has(task.id)) graph.set(task.id, new Set());
    for (const dependency of task.dependsOn ?? []) {
      graph.get(task.id)?.add(dependency);
      if (!graph.has(dependency)) graph.set(dependency, new Set());
    }
  }
  const degree = new Map<string, number>();
  for (const [id, dependencies] of graph) {
    if (!degree.has(id)) degree.set(id, 0);
    for (const dependency of dependencies) {
      if (!degree.has(dependency)) degree.set(dependency, 0);
      degree.set(id, (degree.get(id) ?? 0) + 1);
    }
  }
  const queue = [...degree].filter(([, count]) => count === 0).map(([id]) => id);
  const sorted: T[] = [];
  const visited = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === undefined) continue;
    visited.add(id);
    const task = byId.get(id);
    if (task) sorted.push(task);
    for (const [other, dependencies] of graph) {
      if (!dependencies.delete(id)) continue;
      degree.set(other, (degree.get(other) ?? 0) - 1);
      if (degree.get(other) === 0 && !visited.has(other)) queue.push(other);
    }
  }
  if (visited.size !== graph.size) return undefined;
  return [...sorted, ...tasks.filter(task => !task.id)];
}
