import { describe, expect, it } from "vitest";
import {
  CliGroundingUnavailableError,
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
      taskFields: [{ referenceName: "System.Title" }],
    });
    expect(options.savedQueries).toEqual([{ id: "query-1", path: "Shared/Current work" }]);
    expect(statesForTypes(options, ["Bug", "User Story"])).toEqual(["Active", "Approved", "New"]);
    expect(statesForTypes(options, [])).toEqual(["Active", "Approved", "New"]);
  });

  it("uses the CLI for Azure DevOps profiles and profile-scoped metadata", async () => {
    const calls: string[][] = [];
    const execute = async (args: string[]) => {
      calls.push(args);
      if (args[0] === "auth") return { code: 0, stdout: JSON.stringify([
        { name: "ado", platform: "azure-devops", isDefault: true, organizationUrl: "https://dev.azure.com/org", project: "Project", team: "Platform" },
        { name: "ai", platform: "github-models", isDefault: false, model: "gpt", tokenStorage: "keychain" },
      ]), stderr: "" };
      return { code: 0, stdout: JSON.stringify({ workItemTypes: [], statesByWorkItemType: {}, areaPaths: [], iterationPaths: [], teams: [], savedQueries: [], taskFields: [] }), stderr: "" };
    };
    await expect(listAzureDevOpsProfiles(execute)).resolves.toMatchObject([{ name: "ado", platform: "azure-devops" }]);
    await loadGroundedFieldOptions("ado", execute);
    expect(calls).toEqual([
      ["auth", "list", "--json"],
      ["template", "metadata", "--profile", "ado", "--json"],
    ]);
  });
});

it("explains when the installed CLI predates project grounding", async () => {
  await expect(loadGroundedFieldOptions("ado", async () => ({ code: 1, stdout: "", stderr: "error: unknown command 'metadata'" }))).rejects.toBeInstanceOf(CliGroundingUnavailableError);
});

it("does not expose a CLI stack trace when an Azure DevOps token expires", async () => {
  const error = await loadGroundedFieldOptions("ado", async () => ({ code: 1, stdout: "", stderr: "AuthError: Authentication failed: Access Denied: The Personal Access Token used has expired.\nfile:///stack.js:1" })).catch((reason) => reason);
  expect(error).toBeInstanceOf(ProjectConnectionError);
  expect((error as Error).message).toBe("Your Azure DevOps access token has expired. Add a new project connection with a current token, then try again.");
});
