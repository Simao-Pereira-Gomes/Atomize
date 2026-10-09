import { beforeEach, describe, expect, mock, test } from "bun:test";

// Every prompt answers from one ordered script, so each test reads as the wizard conversation.
let answers: unknown[] = [];
const prompts: Array<{ message?: string; initialValue?: unknown }> = [];
const next = mock(async (prompt?: unknown) => {
  prompts.push(prompt as { message?: string; initialValue?: unknown });
  if (answers.length === 0) throw new Error("The wizard asked more questions than the script answers");
  return answers.shift();
});

mock.module("@clack/prompts", () => ({
  isTTY: () => true,
  isCI: () => false,
  isCancel: () => false,
  cancel: mock(),
  confirm: next,
  select: next,
  text: next,
  multiselect: next,
  autocomplete: next,
}));

import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import { buildTaskDefinition, configureAdvancedTaskOptions } from "@/cli/commands/template/task-configuration";
import { handleEstimationNormalization, offerRepeatLimit } from "@/cli/commands/template/template-wizard";

beforeEach(() => {
  answers = [];
  prompts.length = 0;
});

describe("configureAdvancedTaskOptions repeat", () => {
  test("a repeated task skips the dependency prompt", async () => {
    answers = [
      "3", // copies
      false, // add a condition?
      "", // priority
    ];

    expect(await configureAdvancedTaskOptions([])).toEqual({ repeat: 3 });
    expect(answers).toEqual([]);
  });

  test("a single task is asked for dependencies and writes no repeat", async () => {
    answers = ["1", "design, build", false, ""];

    expect(await configureAdvancedTaskOptions([])).toEqual({ dependsOn: ["design", "build"] });
  });

  test("pre-fills the copies from the task being edited", async () => {
    answers = ["4", false, ""];

    await configureAdvancedTaskOptions([], { title: "Review", repeat: 4 });

    expect(prompts[0]?.initialValue).toBe("4");
  });

  test("rejects a copy count that isn't a whole number of at least 1", async () => {
    answers = ["2", false, ""];
    await configureAdvancedTaskOptions([]);

    const validate = (prompts[0] as { validate?: (input: string) => string | undefined }).validate;
    expect(validate?.("0")).toBeDefined();
    expect(validate?.("1.5")).toBeDefined();
    expect(validate?.("abc")).toBeDefined();
    expect(validate?.("3")).toBeUndefined();
  });
});

describe("buildTaskDefinition repeat", () => {
  test("editing a repeated task without advanced options keeps its repeat", async () => {
    answers = [
      "review", // id
      "Review", // title
      "", // description
      "10", // estimation percent
      false, // conditional percentages?
      false, // custom fields?
    ];

    const task = await buildTaskDefinition(false, false, [], [], { id: "review", title: "Review", estimationPercent: 10, repeat: 3 });

    expect(task.repeat).toBe(3);
  });
});

describe("handleEstimationNormalization with repeated tasks", () => {
  test("does not offer to normalise definitions when a task repeats", async () => {
    const tasks = [
      { title: "Build", estimationPercent: 50 },
      { title: "Review", estimationPercent: 20, repeat: 3 },
    ];

    await handleEstimationNormalization(tasks);

    expect(prompts).toEqual([]);
    expect(tasks.map((t) => t.estimationPercent)).toEqual([50, 20]);
  });

  test("counts copies when checking the total reaches 100%", async () => {
    await handleEstimationNormalization([
      { title: "Build", estimationPercent: 70 },
      { title: "Review", estimationPercent: 10, repeat: 3 },
    ]);

    expect(prompts).toEqual([]);
  });
});

describe("offerRepeatLimit", () => {
  const template = (repeat: number, maxRepeat?: number): TaskTemplate => ({
    version: "1.0",
    name: "Repeat",
    filter: {},
    tasks: [{ title: "Review", repeat }],
    ...(maxRepeat ? { validation: { maxRepeat } } : {}),
  });

  test("asks nothing when every task is within the limit", async () => {
    const t = template(20);
    await offerRepeatLimit(t);
    expect(prompts).toEqual([]);
    expect(t.validation).toBeUndefined();
  });

  test("raises validation.maxRepeat when the author accepts", async () => {
    answers = [true];
    const t = template(30);
    await offerRepeatLimit(t);
    expect(t.validation?.maxRepeat).toBe(30);
  });

  test("leaves the limit alone when the author declines", async () => {
    answers = [false];
    const t = template(30, 25);
    await offerRepeatLimit(t);
    expect(t.validation?.maxRepeat).toBe(25);
  });
});
