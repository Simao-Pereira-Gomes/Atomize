import { describe, expect, it } from "vitest";
import {
  coerceGroundedTaskValue,
  conditionFields,
  editableTaskFields,
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

  it("fetches profile-scoped metadata through the native sidecar command", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    await loadGroundedFieldOptions("ado", async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return { workItemTypes: [], statesByWorkItemType: {}, areaPaths: [], iterationPaths: [], teams: [], savedQueries: [], taskFields: [], fieldsByWorkItemType: {} } as T;
    });
    expect(calls).toEqual([["grounding_load", { profile: "ado" }]]);
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

it("preserves the sidecar's safe expired-token message", async () => {
  const error = await loadGroundedFieldOptions("ado", async () => Promise.reject({ code: "GROUNDING_TOKEN_EXPIRED", message: "Your Azure DevOps access token has expired. Add a new project connection with a current token, then try again." })).catch((reason) => reason);
  expect(error).toBeInstanceOf(ProjectConnectionError);
  expect((error as Error).message).toBe("Your Azure DevOps access token has expired. Add a new project connection with a current token, then try again.");
});

it("explains how to recover a CLI keyfile-backed profile", async () => {
  const error = await loadGroundedFieldOptions("ado", async () => Promise.reject({ code: "INSECURE_TOKEN_STORAGE", message: "This Connection Profile uses CLI insecure storage. Rotate its token in Studio to use it here." })).catch((reason) => reason);
  expect(error).toBeInstanceOf(ProjectConnectionError);
  expect((error as Error).message).toBe("This Connection Profile uses CLI insecure storage. Rotate its token in Studio to use it here.");
});

it("explains how to recover a keychain-backed profile whose token is missing", async () => {
  const error = await loadGroundedFieldOptions("ado", async () => Promise.reject({ code: "CREDENTIAL_MISSING", message: "This Connection Profile has no token in your operating system's credential store. Rotate its token in Studio to reconnect." })).catch((reason) => reason);
  expect(error).toBeInstanceOf(ProjectConnectionError);
  expect((error as Error).message).toBe("This Connection Profile has no token in your operating system's credential store. Rotate its token in Studio to reconnect.");
});
