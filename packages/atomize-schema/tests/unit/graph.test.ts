import { describe, expect, test } from "bun:test";
import {
  buildAdjacencyList,
  detectCycles,
  formatCyclePath,
} from "../../src/graph.js";

const graph = (entries: Record<string, string[]>): Map<string, string[]> =>
  new Map(Object.entries(entries));

describe("buildAdjacencyList", () => {
  test("maps each task id to its dependency ids", () => {
    const list = buildAdjacencyList([
      { id: "a", dependsOn: ["b", "c"] },
      { id: "b", dependsOn: ["c"] },
      { id: "c" },
    ]);
    expect(list.get("a")).toEqual(["b", "c"]);
    expect(list.get("b")).toEqual(["c"]);
    expect(list.get("c")).toEqual([]);
  });

  test("defaults a missing dependsOn to an empty array", () => {
    const list = buildAdjacencyList([{ id: "solo" }]);
    expect(list.get("solo")).toEqual([]);
  });

  test("skips tasks that have no id", () => {
    const list = buildAdjacencyList([
      { dependsOn: ["a"] },
      { id: "a" },
    ]);
    expect(list.has("a")).toBe(true);
    expect(list.size).toBe(1);
  });

  test("a later task with the same id wins", () => {
    const list = buildAdjacencyList([
      { id: "a", dependsOn: ["b"] },
      { id: "a", dependsOn: ["c"] },
    ]);
    expect(list.get("a")).toEqual(["c"]);
  });
});

describe("detectCycles", () => {
  test("reports no cycles for a linear chain", () => {
    const result = detectCycles(graph({ a: ["b"], b: ["c"], c: [] }));
    expect(result.hasCycles).toBe(false);
    expect(result.cycles).toEqual([]);
  });

  test("reports no cycles for a diamond", () => {
    const result = detectCycles(
      graph({ a: ["b", "c"], b: ["d"], c: ["d"], d: [] }),
    );
    expect(result.hasCycles).toBe(false);
  });

  test("detects a direct two-node cycle", () => {
    const result = detectCycles(graph({ a: ["b"], b: ["a"] }));
    expect(result.hasCycles).toBe(true);
    expect(result.cycles).toHaveLength(1);
    const cycle = result.cycles[0] as string[];
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    expect(new Set(cycle)).toEqual(new Set(["a", "b"]));
  });

  test("detects a self-loop", () => {
    const result = detectCycles(graph({ a: ["a"] }));
    expect(result.hasCycles).toBe(true);
    expect(result.cycles[0]).toEqual(["a", "a"]);
  });

  test("detects a longer cycle", () => {
    const result = detectCycles(graph({ a: ["b"], b: ["c"], c: ["a"] }));
    expect(result.hasCycles).toBe(true);
    expect(result.cycles).toHaveLength(1);
    expect(new Set(result.cycles[0])).toEqual(new Set(["a", "b", "c"]));
  });

  test("reports each distinct cycle once, not per DFS entry point", () => {
    const result = detectCycles(graph({ a: ["b"], b: ["a"], c: ["a"] }));
    expect(result.cycles).toHaveLength(1);
  });

  test("reports multiple independent cycles", () => {
    const result = detectCycles(
      graph({ a: ["b"], b: ["a"], c: ["d"], d: ["c"] }),
    );
    expect(result.hasCycles).toBe(true);
    expect(result.cycles).toHaveLength(2);
  });

  test("ignores edges pointing to nodes outside the graph", () => {
    const result = detectCycles(graph({ a: ["ghost"], b: ["a"] }));
    expect(result.hasCycles).toBe(false);
  });

  test("finds a cycle even when the graph also has an acyclic component", () => {
    const result = detectCycles(
      graph({ x: ["y"], y: [], a: ["b"], b: ["c"], c: ["a"] }),
    );
    expect(result.hasCycles).toBe(true);
    expect(result.cycles).toHaveLength(1);
  });

  test("handles an empty graph", () => {
    const result = detectCycles(new Map());
    expect(result).toEqual({ hasCycles: false, cycles: [] });
  });

  test("works end to end with buildAdjacencyList", () => {
    const list = buildAdjacencyList([
      { id: "a", dependsOn: ["b"] },
      { id: "b", dependsOn: ["a"] },
    ]);
    expect(detectCycles(list).hasCycles).toBe(true);
  });
});

describe("formatCyclePath", () => {
  test("renders a quoted, arrow-joined path", () => {
    expect(formatCyclePath(["a", "b", "a"])).toBe('"a" → "b" → "a"');
  });

  test("renders a single node", () => {
    expect(formatCyclePath(["only"])).toBe('"only"');
  });
});
