import { beforeEach, describe, expect, mock, test } from "bun:test";

// Every prompt answers from one ordered script, so each test reads as the wizard conversation.
let answers: unknown[] = [];
const next = mock(async (_prompt?: unknown) => {
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

import { AZURE_DEVOPS_ESTIMATION_DEFAULTS } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/estimation-defaults";
import type { ADoFieldSchema } from "@sppg2001/atomize-core/platforms/interfaces/field-schema.interface";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import { TemplateValidator } from "@sppg2001/atomize-core/templates/validator";
import { configureEstimation, renderConversionTable } from "@/cli/commands/template/template-wizard-helper.command";

function field(referenceName: string, overrides: Partial<ADoFieldSchema> = {}): ADoFieldSchema {
  return { referenceName, name: referenceName, type: "string", isCustom: true, isReadOnly: false, isMultiline: false, isPicklist: false, ...overrides };
}

function templateWith(estimation: TaskTemplate["estimation"], taskType?: string): TaskTemplate {
  return {
    version: "1.0",
    name: "Wizard",
    filter: { workItemTypes: ["User Story"] },
    tasks: [{ title: "Build", estimationPercent: 100 }],
    ...(taskType ? { taskType } : {}),
    estimation,
  };
}

describe("configureEstimation wizard step", () => {
  beforeEach(() => {
    answers = [];
  });

  test("offline: produces a factor Template that passes Offline Validation", async () => {
    answers = ["", "factor", "4", false, "none", "0", "warn"];

    const { estimation, taskType } = await configureEstimation();

    expect(estimation).toEqual({ strategy: "percentage", rounding: "none", conversion: { factor: 4 } });
    expect(taskType).toBeUndefined();
    expect(new TemplateValidator().validate(templateWith(estimation)).errors).toEqual([]);
    expect(answers).toEqual([]);
  });

  test("connected: builds a t-shirt table from picklist values and offers child types and numeric target fields", async () => {
    const getTaskFields = mock(async () => [field("Custom.Effort", { type: "integer" }), field("Custom.Notes")]);
    answers = [
      "Custom.TShirtSize", // source picked from the estimate-capable Story fields
      "table",
      "2", "4", "5", // hours for S, M, L
      "done", // table editor menu
      true, // accept multiples like 0.3L
      true, // customise where estimates are written
      "Sub-task",
      ["Custom.Effort"],
      "nearest",
      "0.5",
      "use-default",
      "M",
    ];

    const { estimation, taskType } = await configureEstimation(undefined, {
      storyFields: [field("Custom.TShirtSize", { isPicklist: true, allowedValues: ["S", "M", "L"] })],
      workItemTypes: ["User Story", "Task", "Sub-task"],
      defaults: AZURE_DEVOPS_ESTIMATION_DEFAULTS,
      getTaskFields,
    });

    expect(taskType).toBe("Sub-task");
    expect(getTaskFields).toHaveBeenCalledWith("Sub-task");
    expect(estimation).toEqual({
      strategy: "percentage",
      rounding: "nearest",
      minimumTaskEstimate: 0.5,
      source: "Custom.TShirtSize",
      conversion: { table: { S: 2, M: 4, L: 5 }, multipliers: true },
      targetFields: ["Custom.Effort"],
      ifParentHasNoEstimation: "use-default",
      defaultParentEstimation: "M",
    });
    expect(new TemplateValidator().validate(templateWith(estimation, taskType)).errors).toEqual([]);
    expect(answers).toEqual([]);
  });

  test("choosing no conversion and no overrides adds none of the new keys", async () => {
    answers = ["", "none", false, "none", "0", "warn"];

    const { estimation, taskType } = await configureEstimation();

    expect(estimation).toEqual({ strategy: "percentage", rounding: "none" });
    expect(taskType).toBeUndefined();
  });

  test("editing writes minimumTaskEstimate and drops the deprecated minimumTaskPoints", async () => {
    answers = ["", "none", false, "none", "0.5", "warn"];

    const { estimation } = await configureEstimation({ strategy: "percentage", rounding: "none", minimumTaskPoints: 0.5 });

    expect(estimation).toEqual({ strategy: "percentage", rounding: "none", minimumTaskEstimate: 0.5 });
  });

  test("connected without platform defaults: the Story field is still chosen from the project's fields", async () => {
    answers = ["Custom.TShirtSize", "none", false, "none", "0", "warn"];

    const { estimation } = await configureEstimation(undefined, {
      storyFields: [field("Custom.TShirtSize", { isPicklist: true, allowedValues: ["S", "M"] })],
    });

    const firstPrompt = next.mock.calls.at(-6)?.[0] as { options?: Array<{ value: string }> };
    expect(firstPrompt.options?.map((o) => o.value)).toEqual(["", "Custom.TShirtSize", "__custom__"]);
    expect(estimation.source).toBe("Custom.TShirtSize");
  });

  test("the default Story Estimate is chosen from the picklist, with typing only as an explicit option for fractional sizes", async () => {
    answers = [
      "Custom.TShirtSize",
      "table",
      "2", "4", // S, M
      "done", // table editor menu
      true, // fractional sizes
      false,
      "none",
      "0",
      "use-default",
      "__custom__",
      "0.5M",
    ];

    const { estimation } = await configureEstimation(undefined, {
      storyFields: [field("Custom.TShirtSize", { isPicklist: true, allowedValues: ["S", "M"] })],
    });

    const defaultPrompt = next.mock.calls.at(-2)?.[0] as { options?: Array<{ value: string }> };
    expect(defaultPrompt.options?.map((o) => o.value)).toEqual(["S", "M", "__custom__"]);
    expect(estimation.defaultParentEstimation).toBe("0.5M");
  });

  test("lists custom free-text size fields, not only picklists, but never multi-line text", async () => {
    answers = ["Custom.SizeText", "none", false, "none", "0", "warn"];

    await configureEstimation(undefined, {
      storyFields: [field("Custom.SizeText"), field("Custom.Notes", { isMultiline: true })],
      defaults: AZURE_DEVOPS_ESTIMATION_DEFAULTS,
    });

    const firstPrompt = next.mock.calls.at(-6)?.[0] as { options?: Array<{ value: string }> };
    expect(firstPrompt.options?.map((o) => o.value)).toEqual(["", "Custom.SizeText", "__custom__"]);
  });

  test("lists process-defined size fields and the platform's own estimate fields, custom fields first", async () => {
    answers = ["MyCompany.TShirtSize", "none", false, "none", "0", "warn"];

    const { estimation } = await configureEstimation(undefined, {
      storyFields: [
        field("Microsoft.VSTS.Scheduling.StoryPoints", { name: "Story Points", type: "decimal", isCustom: false }),
        field("MyCompany.TShirtSize", { name: "T-shirt size", isCustom: false, isPicklist: true, allowedValues: ["S", "L"] }),
        field("Custom.Complexity", { name: "Complexity", isPicklist: true, allowedValues: ["Low", "High"] }),
        field("System.Title", { name: "Title", isCustom: false }),
      ],
      defaults: AZURE_DEVOPS_ESTIMATION_DEFAULTS,
    });

    const firstPrompt = next.mock.calls.at(-6)?.[0] as { options?: Array<{ value: string }> };
    expect(firstPrompt.options?.map((o) => o.value)).toEqual([
      "",
      "Custom.Complexity",
      "Microsoft.VSTS.Scheduling.StoryPoints",
      "MyCompany.TShirtSize",
      "__custom__",
    ]);
    expect(estimation.source).toBe("MyCompany.TShirtSize");
  });

  test("table editor: add, change, remove and paste values for a non-picklist source, refusing to finish empty", async () => {
    answers = [
      "", // platform default source
      "table",
      "done", // refused: the table is still empty
      "add", "8", "40",
      "paste", "13=80, 5=16",
      "change", "8", "32",
      "remove", "5",
      "done",
      // numeric keys skip the fractional-sizes question
      false, // keep the platform's task type and fields
      "none",
      "0",
      "warn",
    ];

    const { estimation } = await configureEstimation();

    expect(estimation.conversion).toEqual({ table: { 8: 32, 13: 80 } });
    expect(answers).toEqual([]);
  });
});

describe("renderConversionTable", () => {
  test("shows each value with its hours and a 20% preview, plus picklist coverage, gaps and typos", () => {
    const lines = renderConversionTable({ S: 2, L: 5, Lg: 5 }, { name: "T-shirt size", allowedValues: ["S", "M", "L"] });

    expect(lines[0]).toBe("Conversion table — T-shirt size → hours   2 of 3 values covered");
    expect(lines).toContain("  S      2       0.4 h");
    expect(lines.some((line) => line.startsWith("  Lg") && line.endsWith("not in picklist"))).toBe(true);
    expect(lines.at(-1)).toBe("  Missing: M — Stories with this value get blank estimates.");
  });

  test("says when the table is empty", () => {
    expect(renderConversionTable({})).toEqual(["Conversion table — Story Estimate → hours", "  (no values yet)"]);
  });
});
