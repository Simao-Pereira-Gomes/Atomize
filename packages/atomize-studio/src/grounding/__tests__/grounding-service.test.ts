import { describe, expect, it } from "vitest";
import {
  CliGroundingUnavailableError,
  conditionFields,
  coerceGroundedTaskValue,
  editableTaskFields,
  listAzureDevOpsProfiles,
  loadGroundedFieldOptions,
  ProjectConnectionError,
  parseGroundedFieldOptions,
  statesForTypes,
} from "../grounding-service";

describe("grounding service", () => {
  it("maps the CLI metadata contract and combines states for selected types", () => {
    const options = parseGroundedFieldOptions({
      workItemTypes: ["Bug", "User Story"],
      statesByWorkItemType: { Bug: ["New", "Active"], "User Story": ["New", "Approved"] },
      areaPaths: ["Project\\Backend"],
      iterationPaths: ["Project\\Sprint 1"],
      teams: ["Platform"],
      savedQueries: [{ id: "query-1", path: "Shared/Current work" }],
      taskFields: [{ referenceName: "Custom.Release", name: "Release", type: "string", isCustom: true, isReadOnly: false, isMultiline: false, isPicklist: true, allowedValues: ["R1", "R2"] }],
      fieldsByWorkItemType: { "User Story": [{ referenceName: "Custom.ClientTier", name: "Client tier", type: "string", isCustom: true, isReadOnly: false, isMultiline: false, isPicklist: true, allowedValues: ["Enterprise"] }] },
    });
    expect(options.savedQueries).toEqual([{ id: "query-1", path: "Shared/Current work" }]);
    expect(statesForTypes(options, ["Bug", "User Story"])).toEqual(["Active", "Approved", "New"]);
    expect(statesForTypes(options, [])).toEqual(["Active", "Approved", "New"]);
    expect(options.taskFields).toEqual([{ referenceName: "Custom.Release", name: "Release", type: "string", isCustom: true, isReadOnly: false, isMultiline: false, isPicklist: true, allowedValues: ["R1", "R2"] }]);
    expect(conditionFields(options, ["User Story"]).map((field) => field.referenceName)).toEqual(["Custom.ClientTier"]);
  });

  it("uses the CLI for Azure DevOps profiles and profile-scoped metadata", async () => {
    const calls: string[][] = [];
    const execute = async (args: string[]) => {
      calls.push(args);
      if (args[0] === "auth") return { code: 0, stdout: JSON.stringify([
        { name: "ado", platform: "azure-devops", isDefault: true, organizationUrl: "https://dev.azure.com/org", project: "Project", team: "Platform" },
        { name: "ai", platform: "github-models", isDefault: false, model: "gpt", tokenStorage: "keychain" },
      ]), stderr: "" };
      return { code: 0, stdout: JSON.stringify({ workItemTypes: [], statesByWorkItemType: {}, areaPaths: [], iterationPaths: [], teams: [], savedQueries: [], taskFields: [], fieldsByWorkItemType: {} }), stderr: "" };
    };
    await expect(listAzureDevOpsProfiles(execute)).resolves.toMatchObject([{ name: "ado", platform: "azure-devops" }]);
    await loadGroundedFieldOptions("ado", execute);
    expect(calls).toEqual([
      ["auth", "list", "--json"],
      ["template", "metadata", "--profile", "ado", "--json"],
    ]);
  });
});

it("offers every writable project Task field except fields authored by dedicated controls", () => {
  const options = parseGroundedFieldOptions({
    workItemTypes: [], statesByWorkItemType: {}, areaPaths: [], iterationPaths: [], teams: [], savedQueries: [],
    taskFields: [
      { referenceName: "Custom.Release", name: "Release", type: "string", isCustom: true, isReadOnly: false, isMultiline: false, isPicklist: false },
      { referenceName: "Microsoft.VSTS.Common.Severity", name: "Severity", type: "string", isCustom: false, isReadOnly: false, isMultiline: false, isPicklist: true, allowedValues: ["1 - Critical"] },
      { referenceName: "System.Title", name: "Title", type: "string", isCustom: false, isReadOnly: false, isMultiline: false, isPicklist: false },
      { referenceName: "Custom.ReadOnly", name: "Read only", type: "string", isCustom: true, isReadOnly: true, isMultiline: false, isPicklist: false },
    ],
  });

  expect(editableTaskFields(options).map((field) => field.referenceName)).toEqual([
    "Custom.Release", "Microsoft.VSTS.Common.Severity",
  ]);
});

it("uses the existing connected-project field list for conditions when the CLI predates per-type metadata", () => {
  const options = parseGroundedFieldOptions({
    workItemTypes: [], statesByWorkItemType: {}, areaPaths: [], iterationPaths: [], teams: [], savedQueries: [],
    taskFields: [{ referenceName: "Custom.ClientTier", name: "Client tier", type: "string", isCustom: true, isReadOnly: false, isMultiline: false, isPicklist: true, allowedValues: ["Enterprise"] }],
  });

  expect(conditionFields(options, ["User Story"]).map((field) => field.referenceName)).toEqual(["Custom.ClientTier"]);
});

it("coerces grounded field values according to the Azure DevOps field type", () => {
  const field = (type: "string" | "integer" | "decimal" | "boolean") => ({
    referenceName: "Custom.Field", name: "Field", type, isCustom: true,
    isReadOnly: false, isMultiline: false, isPicklist: false,
  });

  expect(coerceGroundedTaskValue(field("integer"), "2")).toBe(2);
  expect(coerceGroundedTaskValue(field("decimal"), "2.5")).toBe(2.5);
  expect(coerceGroundedTaskValue(field("boolean"), "false")).toBe(false);
  expect(coerceGroundedTaskValue(field("string"), "2")).toBe("2");
});

it("passes datetime field values through unchanged, including date macros", () => {
  const field = { referenceName: "Custom.Due", name: "Due", type: "datetime" as const, isCustom: true, isReadOnly: false, isMultiline: false, isPicklist: false };
  expect(coerceGroundedTaskValue(field, "2026-07-17")).toBe("2026-07-17");
  expect(coerceGroundedTaskValue(field, "@Today")).toBe("@Today");
});

it("explains when the installed CLI predates project grounding", async () => {
  await expect(loadGroundedFieldOptions("ado", async () => ({ code: 1, stdout: "", stderr: "error: unknown command 'metadata'" }))).rejects.toBeInstanceOf(CliGroundingUnavailableError);
});

it("does not expose a CLI stack trace when an Azure DevOps token expires", async () => {
  const error = await loadGroundedFieldOptions("ado", async () => ({ code: 1, stdout: "", stderr: "AuthError: Authentication failed: Access Denied: The Personal Access Token used has expired.\nfile:///stack.js:1" })).catch((reason) => reason);
  expect(error).toBeInstanceOf(ProjectConnectionError);
  expect((error as Error).message).toBe("Your Azure DevOps access token has expired. Add a new project connection with a current token, then try again.");
});
