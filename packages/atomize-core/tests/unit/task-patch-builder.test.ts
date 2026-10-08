import { describe, expect, test } from "bun:test";
import { AZURE_DEVOPS_ESTIMATION_DEFAULTS } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/estimation-defaults";
import {
  buildCreateTaskPatch,
  resolveDateMacro,
} from "@sppg2001/atomize-core/platforms/adapters/azure-devops/task-patch-builder";

const DEFAULT_WRITE = {
  fields: AZURE_DEVOPS_ESTIMATION_DEFAULTS.taskEstimateFields,
  initializeCompletedWork: true,
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("resolveDateMacro", () => {
  test("resolves @Today and @StartOfDay to today's date, case-insensitively", () => {
    const now = new Date();
    const expected = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    expect(resolveDateMacro("@Today")).toBe(expected);
    expect(resolveDateMacro("@today")).toBe(expected);
    expect(resolveDateMacro("@StartOfDay")).toBe(expected);
  });

  test("resolves @StartOfMonth and @StartOfYear", () => {
    const now = new Date();
    expect(resolveDateMacro("@StartOfMonth")).toBe(
      isoDate(new Date(now.getFullYear(), now.getMonth(), 1))
    );
    expect(resolveDateMacro("@StartOfYear")).toBe(
      isoDate(new Date(now.getFullYear(), 0, 1))
    );
  });

  test("resolves @StartOfWeek to the most recent Sunday", () => {
    const now = new Date();
    const expected = isoDate(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    );
    expect(resolveDateMacro("@StartOfWeek")).toBe(expected);
  });

  test("applies a numeric day offset, with or without spaces", () => {
    const now = new Date();
    const expectedPlus = isoDate(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
    );
    expect(resolveDateMacro("@Today+7")).toBe(expectedPlus);
    expect(resolveDateMacro("@Today + 7")).toBe(expectedPlus);
    const expectedMinus = isoDate(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3)
    );
    expect(resolveDateMacro("@Today-3")).toBe(expectedMinus);
  });

  test("leaves plain ISO dates and unrelated strings untouched", () => {
    expect(resolveDateMacro("2026-04-01")).toBe("2026-04-01");
    expect(resolveDateMacro("Enterprise")).toBe("Enterprise");
  });

  test("leaves non-string values untouched", () => {
    expect(resolveDateMacro(true)).toBe(true);
    expect(resolveDateMacro(42)).toBe(42);
  });
});

describe("buildCreateTaskPatch custom field macro resolution", () => {
  test("resolves date macros in customFields but leaves other custom field values untouched", () => {
    const now = new Date();
    const expectedToday = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    //biome-ignore-start lint/suspicious/noExplicitAny : JsonPatchDocument isn't typed as an array; narrowing isn't worth it in a test
    const patch: any = buildCreateTaskPatch("https://dev.azure.com/test", 100, {
      title: "Task with a due date",
      customFields: {
        "Custom.DueDate": "@Today",
        "Custom.ClientTier": "Enterprise",
      },
    }, DEFAULT_WRITE);
    const dueDateOp = patch.find((op: any) => op.path === "/fields/Custom.DueDate");
    const clientTierOp = patch.find((op: any) => op.path === "/fields/Custom.ClientTier");
    //biome-ignore-end lint/suspicious/noExplicitAny : JsonPatchDocument isn't typed as an array; narrowing isn't worth it in a test
    expect(dueDateOp?.value).toBe(expectedToday);
    expect(clientTierOp?.value).toBe("Enterprise");
  });
});

describe("buildCreateTaskPatch estimate fields", () => {
  //biome-ignore-start lint/suspicious/noExplicitAny : JsonPatchDocument isn't typed as an array; narrowing isn't worth it in a test
  const fieldOps = (patch: any) =>
    Object.fromEntries(
      patch
        .filter((op: any) => op.path.startsWith("/fields/Microsoft.VSTS.Scheduling") || op.path.startsWith("/fields/Custom.Effort"))
        .map((op: any) => [op.path.replace("/fields/", ""), op.value]),
    );
  //biome-ignore-end lint/suspicious/noExplicitAny : JsonPatchDocument isn't typed as an array; narrowing isn't worth it in a test

  test("writes the Task Estimate to the Azure DevOps default fields and initialises CompletedWork", () => {
    const patch = buildCreateTaskPatch("https://dev.azure.com/test", 100, { title: "T", estimation: 2.5 }, DEFAULT_WRITE);
    expect(fieldOps(patch)).toEqual({
      "Microsoft.VSTS.Scheduling.RemainingWork": 2.5,
      "Microsoft.VSTS.Scheduling.OriginalEstimate": 2.5,
      "Microsoft.VSTS.Scheduling.CompletedWork": 0,
    });
  });

  test("writes no estimate fields when the Task Estimate is blank", () => {
    const patch = buildCreateTaskPatch("https://dev.azure.com/test", 100, { title: "T" }, DEFAULT_WRITE);
    expect(fieldOps(patch)).toEqual({ "Microsoft.VSTS.Scheduling.CompletedWork": 0 });
  });

  test("writes only the given fields and leaves CompletedWork alone when not asked to initialise it", () => {
    const patch = buildCreateTaskPatch("https://dev.azure.com/test", 100, { title: "T", estimation: 4 }, { fields: ["Custom.Effort"] });
    expect(fieldOps(patch)).toEqual({ "Custom.Effort": 4 });
  });
});
