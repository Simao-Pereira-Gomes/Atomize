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
