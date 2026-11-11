import type { WorkItem } from "../platforms/interfaces/work-item.interface";
import type { CalculatedTask } from "./estimation-calculator";

export interface ExistingTaskMatch {
  /** Indexed like the planned Tasks: the child Task each one matched, or undefined when it is missing. */
  existing: Array<WorkItem | undefined>;
  /**
   * Indices of planned Tasks matched to a child whose title more than one child shares. Which child is
   * "the" Task is a guess, so no dependency link is made to or from it.
   */
  ambiguous: Set<number>;
  /** How many children carry each ambiguous title. */
  childrenTitled: Map<string, number>;
  /** The planned Tasks with no child of the same title left to match; these are the ones to create. */
  missing: CalculatedTask[];
  /** Child Tasks no planned Task matched. */
  notInPlan: WorkItem[];
}

/**
 * Matches a Story's planned Tasks against its existing child Tasks by title. Each child matches at
 * most one planned Task, so a repeated task with three copies and one existing child leaves two.
 */
export function matchExistingTasks(planned: CalculatedTask[], children: WorkItem[]): ExistingTaskMatch {
  const childrenTitled = new Map<string, number>();
  for (const child of children) childrenTitled.set(child.title, (childrenTitled.get(child.title) ?? 0) + 1);

  const unmatched = [...children];
  const existing: Array<WorkItem | undefined> = [];
  const ambiguous = new Set<number>();
  const missing: CalculatedTask[] = [];
  planned.forEach((task, index) => {
    const childIndex = unmatched.findIndex((child) => child.title === task.title);
    if (childIndex === -1) {
      existing.push(undefined);
      missing.push(task);
      return;
    }
    existing.push(unmatched.splice(childIndex, 1)[0]);
    if ((childrenTitled.get(task.title) ?? 0) > 1) ambiguous.add(index);
  });
  return { existing, ambiguous, childrenTitled, missing, notInPlan: unmatched };
}
