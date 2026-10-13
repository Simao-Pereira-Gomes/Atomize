import { describe, expect, test } from "bun:test";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import {
  fetchProjectGrounding,
  ProjectGroundingError,
  toProjectGroundingError,
} from "@sppg2001/atomize-core/services/template/project-grounding";
import { AuthError } from "@sppg2001/atomize-core/utils/errors";

const TOKEN = "super-secret-pat";

/** An adapter exposing project metadata, standing in for a connected Azure DevOps project. */
function metadataAdapter(overrides: Partial<Record<string, unknown>> = {}): IPlatformAdapter {
  return {
    token: TOKEN,
    getEstimationDefaults: () => ({
      storyEstimateFields: ["Microsoft.VSTS.Scheduling.StoryPoints"],
      taskWorkItemType: "Task",
      taskEstimateFields: ["Microsoft.VSTS.Scheduling.RemainingWork"],
      unitLabel: "hours",
    }),
    getWorkItemTypes: async () => ["User Story", "Task"],
    getStatesForWorkItemType: async (type: string) => (type === "Task" ? ["To Do", "Done"] : ["New", "Active", "Closed"]),
    getAreaPaths: async () => ["Proj", "Proj\\Web"],
    getIterationPaths: async () => ["Proj\\Sprint 1"],
    getTeams: async () => ["Proj Team"],
    listSavedQueries: async () => [{ id: "q1", name: "Ready", path: "Shared Queries/Ready", isPublic: true }],
    getFieldSchemas: async (type?: string) => [{ referenceName: `Custom.${type ?? "Any"}`, name: "Field", type: "string", isCustom: true }],
    ...overrides,
  } as unknown as IPlatformAdapter;
}

describe("fetchProjectGrounding", () => {
  test("assembles the project's curated metadata", async () => {
    const grounding = await fetchProjectGrounding(metadataAdapter());

    expect(grounding.workItemTypes).toEqual(["User Story", "Task"]);
    expect(grounding.statesByWorkItemType).toEqual({ "User Story": ["New", "Active", "Closed"], Task: ["To Do", "Done"] });
    expect(grounding.areaPaths).toEqual(["Proj", "Proj\\Web"]);
    expect(grounding.iterationPaths).toEqual(["Proj\\Sprint 1"]);
    expect(grounding.teams).toEqual(["Proj Team"]);
    expect(grounding.savedQueries).toEqual([{ id: "q1", path: "Shared Queries/Ready" }]);
    expect(grounding.taskFields[0]?.referenceName).toBe("Custom.Task");
    expect(Object.keys(grounding.fieldsByWorkItemType)).toEqual(["User Story", "Task"]);
    expect(grounding.estimation).toBeDefined();
  });

  test("never includes the connection's token", async () => {
    const grounding = await fetchProjectGrounding(metadataAdapter());
    expect(JSON.stringify(grounding)).not.toContain(TOKEN);
  });

  test("reports an adapter without project metadata as a fetch failure", async () => {
    const error = await fetchProjectGrounding(metadataAdapter({ getTeams: undefined })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProjectGroundingError);
    expect((error as ProjectGroundingError).code).toBe("GROUNDING_FETCH_FAILED");
  });

  test("reports a metadata call failing as a typed error", async () => {
    const failing = metadataAdapter({ getAreaPaths: async () => { throw new AuthError("Authentication failed: access denied", "azure-devops"); } });
    const error = await fetchProjectGrounding(failing).catch((e: unknown) => e);
    expect((error as ProjectGroundingError).code).toBe("GROUNDING_AUTH_FAILED");
  });
});

describe("toProjectGroundingError", () => {
  test.each([
    [new AuthError("Authentication failed: access denied", "azure-devops"), "GROUNDING_AUTH_FAILED"],
    [new Error("Access denied for this project"), "GROUNDING_AUTH_FAILED"],
    [new Error("The personal access token has expired"), "GROUNDING_FETCH_FAILED"],
    [new AuthError("Authentication failed: your personal access token expired", "azure-devops"), "GROUNDING_TOKEN_EXPIRED"],
    [new Error("socket hang up"), "GROUNDING_FETCH_FAILED"],
  ])("classifies %p as %s", (error, code) => {
    expect(toProjectGroundingError(error).code).toBe(code as never);
  });

  test("gives each code a readable message", () => {
    expect(toProjectGroundingError(new Error("socket hang up")).message).toContain("project metadata");
    expect(toProjectGroundingError(new AuthError("Authentication failed: token expired", "azure-devops")).message).toContain("expired");
  });

  test("keeps an existing ProjectGroundingError as it is", () => {
    const original = new ProjectGroundingError("GROUNDING_AUTH_FAILED", "x");
    expect(toProjectGroundingError(original)).toBe(original);
  });
});
