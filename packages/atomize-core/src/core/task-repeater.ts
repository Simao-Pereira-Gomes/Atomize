import type { TaskDefinition } from "../templates/schema";

/** One generated instance of a template task; a task with `repeat: N` yields N of these. */
export interface RepeatedTask<T> {
  task: T;
  /** 1-based position of this copy among the task's copies. */
  iteration: number;
  iterationCount: number;
}

/**
 * Expands each task into `repeat` instances (one when unset), preserving task order.
 * Every copy shares the same task definition; only its iteration differs.
 */
export function repeatTasks<T extends Pick<TaskDefinition, "repeat">>(
  tasks: readonly T[],
): RepeatedTask<T>[] {
  return tasks.flatMap((task) => {
    const iterationCount = task.repeat ?? 1;
    return Array.from({ length: iterationCount }, (_, index) => ({
      task,
      iteration: index + 1,
      iterationCount,
    }));
  });
}

/** Suffixes a copy's title with its position (e.g. "Review (2)") so repeated Tasks are distinguishable. */
export function withOrdinal(
  title: string,
  { iteration, iterationCount }: Pick<RepeatedTask<unknown>, "iteration" | "iterationCount">,
): string {
  return iterationCount > 1 ? `${title} (${iteration})` : title;
}
