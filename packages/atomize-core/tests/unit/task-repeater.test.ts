import { describe, expect, test } from "bun:test";
import { repeatTasks, withOrdinal } from "@sppg2001/atomize-core/core/task-repeater";
import type { TaskDefinition } from "@sppg2001/atomize-core/templates/schema";

describe("repeatTasks", () => {
  test("a task without repeat expands to exactly one instance", () => {
    const task: TaskDefinition = { title: "Review" };

    expect(repeatTasks([task])).toEqual([{ task, iteration: 1, iterationCount: 1 }]);
  });

  test("repeat: 1 behaves like an unset repeat", () => {
    const task: TaskDefinition = { title: "Review", repeat: 1 };

    expect(repeatTasks([task])).toEqual([{ task, iteration: 1, iterationCount: 1 }]);
  });

  test("a task with repeat: N expands to N instances with their iteration index and count", () => {
    const task: TaskDefinition = { title: "Review", repeat: 3 };

    expect(repeatTasks([task])).toEqual([
      { task, iteration: 1, iterationCount: 3 },
      { task, iteration: 2, iterationCount: 3 },
      { task, iteration: 3, iterationCount: 3 },
    ]);
  });

  test("only repeated tasks expand; others pass through 1:1 with order preserved", () => {
    const design: TaskDefinition = { title: "Design" };
    const review: TaskDefinition = { title: "Review", repeat: 2 };
    const deploy: TaskDefinition = { title: "Deploy" };

    const expanded = repeatTasks([design, review, deploy]);

    expect(expanded.map(({ task, iteration }) => `${task.title}#${iteration}`)).toEqual([
      "Design#1",
      "Review#1",
      "Review#2",
      "Deploy#1",
    ]);
  });

  test("an empty task list expands to nothing", () => {
    expect(repeatTasks([])).toEqual([]);
  });
});

describe("withOrdinal", () => {
  test("leaves a single instance's title unchanged", () => {
    expect(withOrdinal("Review", { iteration: 1, iterationCount: 1 })).toBe("Review");
  });

  test("appends the iteration to each copy of a repeated task", () => {
    expect(withOrdinal("Review", { iteration: 1, iterationCount: 3 })).toBe("Review (1)");
    expect(withOrdinal("Review", { iteration: 3, iterationCount: 3 })).toBe("Review (3)");
  });
});
