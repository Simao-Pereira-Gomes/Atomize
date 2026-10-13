import { describe, expect, test } from "bun:test";
import type { ADoFieldSchema } from "@sppg2001/atomize-core/platforms/interfaces/field-schema.interface";
import { PROJECT_GROUNDING_PROMPT_LIMIT, type ProjectGrounding, projectGroundingForPrompt } from "@sppg2001/atomize-core/services/template/project-grounding";

const field = (referenceName: string, overrides: Partial<ADoFieldSchema> = {}): ADoFieldSchema => ({
  referenceName,
  name: referenceName.split(".").pop() ?? referenceName,
  type: "string",
  isCustom: false,
  isReadOnly: false,
  isMultiline: false,
  isPicklist: false,
  ...overrides,
});

/** An Agile-process-sized project: many work item types, each with well over a hundred fields. */
function largeProject(): ProjectGrounding {
  const types = ["Epic", "Feature", "User Story", "Bug", "Task", "Issue", "Test Case", "Test Plan", "Test Suite", "Shared Steps", "Shared Parameter", "Code Review Request", "Code Review Response", "Feedback Request", "Feedback Response"];
  const common = [
    ...Array.from({ length: 120 }, (_, i) => field(`System.Field${i}`, { isReadOnly: i % 2 === 0 })),
    field("System.Title"),
    field("Microsoft.VSTS.Common.Priority", { type: "integer", isPicklist: true, allowedValues: ["1", "2", "3", "4"] }),
    field("Microsoft.VSTS.Common.Activity", { isPicklist: true, allowedValues: ["Development", "Testing", "Documentation", "Design"] }),
    field("Microsoft.VSTS.Scheduling.StoryPoints", { type: "decimal" }),
    field("Custom.Team", { isCustom: true, isPicklist: true, allowedValues: Array.from({ length: 80 }, (_, i) => `Team ${i}`) }),
    field("Custom.RiskNotes", { isCustom: true, isMultiline: true }),
  ];
  const fieldsByWorkItemType = Object.fromEntries(types.map((type) => [type, common]));
  return {
    workItemTypes: types,
    statesByWorkItemType: Object.fromEntries(types.map((type) => [type, ["New", "Active", "Resolved", "Closed"]])),
    areaPaths: Array.from({ length: 600 }, (_, i) => `Proj\\Area ${i}`),
    iterationPaths: Array.from({ length: 400 }, (_, i) => `Proj\\Sprint ${i}`),
    teams: Array.from({ length: 60 }, (_, i) => `Team ${i}`),
    savedQueries: Array.from({ length: 300 }, (_, i) => ({ id: `q${i}`, path: `Shared Queries/Query ${i}` })),
    taskFields: common,
    fieldsByWorkItemType,
    estimation: { taskWorkItemType: "Task", taskEstimateFields: [], storyEstimateFields: [], unitLabel: "hours" } as unknown as ProjectGrounding["estimation"],
  };
}

describe("projectGroundingForPrompt", () => {
  test("raw Project Grounding for a real-sized project is far too big to send as it is", () => {
    expect(JSON.stringify(largeProject()).length).toBeGreaterThan(PROJECT_GROUNDING_PROMPT_LIMIT * 10);
  });

  test("fits a real-sized project within the prompt limit", () => {
    const { text } = projectGroundingForPrompt(largeProject());
    expect(text.length).toBeLessThanOrEqual(PROJECT_GROUNDING_PROMPT_LIMIT);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  test("keeps what a Template needs: types, states, custom and picklist fields with their values, and the estimation section", () => {
    const parsed = JSON.parse(projectGroundingForPrompt(largeProject()).text);
    expect(parsed.workItemTypes).toContain("User Story");
    expect(parsed.statesByWorkItemType["User Story"]).toEqual(["New", "Active", "Resolved", "Closed"]);
    expect(parsed.fields["Custom.Team"].allowedValues.length).toBeGreaterThan(0);
    expect(parsed.fields["Microsoft.VSTS.Common.Activity"].allowedValues).toEqual(["Development", "Testing", "Documentation", "Design"]);
    expect(parsed.fieldsByWorkItemType["User Story"]).toContain("Custom.Team");
    expect(parsed.estimation).toBeDefined();
  });

  test("leaves out read-only fields, generic system fields, and test or review work item types' fields", () => {
    const parsed = JSON.parse(projectGroundingForPrompt(largeProject()).text);
    expect(parsed.fields["System.Field0"]).toBeUndefined();
    expect(parsed.fields["System.Field1"]).toBeUndefined();
    expect(parsed.fieldsByWorkItemType["Test Case"]).toBeUndefined();
    expect(parsed.fieldsByWorkItemType["Code Review Request"]).toBeUndefined();
  });

  test("lists each field's details once, however many types use it", () => {
    const text = projectGroundingForPrompt(largeProject()).text;
    expect(text.split('"Custom.RiskNotes":').length - 1).toBe(1);
  });

  test("says when it had to shorten lists to fit, and leaves a small project untouched", () => {
    const large = projectGroundingForPrompt(largeProject());
    expect(large.trimmed).toBe(true);
    expect(JSON.parse(large.text).note).toContain("shortened");

    const small: ProjectGrounding = { ...largeProject(), areaPaths: ["Proj"], iterationPaths: ["Proj\\Sprint 1"], teams: ["Proj Team"], savedQueries: [], fieldsByWorkItemType: { Task: [field("Custom.Team", { isCustom: true })] } };
    const result = projectGroundingForPrompt(small);
    expect(result.trimmed).toBe(false);
    expect(JSON.parse(result.text).note).toBeUndefined();
  });
});
