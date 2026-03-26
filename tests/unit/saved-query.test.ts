import { describe, expect, mock, test } from "bun:test";
import { AzureDevOpsAdapter } from "@platforms/adapters/azure-devops/azure-devops.adapter";
import { QueryType } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";

const BASE_CONFIG = {
  type: "azure-devops" as const,
  organizationUrl: "https://dev.azure.com/testorg",
  project: "TestProject",
  token: "test-token",
  team: "TestTeam",
};

// Minimal work item stub
const WORK_ITEM_STUB = {
  id: 1,
  fields: {
    "System.Title": "Test Story",
    "System.WorkItemType": "User Story",
    "System.State": "Active",
  },
  relations: [],
};

function makeAdapter(witApiOverrides: Record<string, unknown> = {}) {
  const adapter = new AzureDevOpsAdapter(BASE_CONFIG);

  // Inject a mock witApi
  const witApi = {
    queryByWiql: mock(async () => ({
      workItems: [{ id: 1 }],
    })),
    getWorkItems: mock(async () => [WORK_ITEM_STUB]),
    getQuery: mock(async () => ({
      id: "a1b2c3d4-e5f6-47b8-8901-234567890123",
      name: "Sprint Active Stories",
      path: "Shared Queries/Sprint Active Stories",
      isFolder: false,
      queryType: QueryType.Flat,
      wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'",
    })),
    getQueries: mock(async () => [
      {
        name: "Shared Queries",
        isFolder: true,
        children: [
          {
            id: "a1b2c3d4-e5f6-47b8-8901-234567890123",
            name: "Sprint Active Stories",
            path: "Shared Queries/Sprint Active Stories",
            isFolder: false,
            isPublic: true,
          },
          {
            id: "b2c3d4e5-0000-0000-0000-000000000000",
            name: "Open Bugs",
            path: "Shared Queries/Open Bugs",
            isFolder: false,
            isPublic: true,
          },
        ],
      },
      {
        name: "My Queries",
        isFolder: true,
        children: [
          {
            id: "c3d4e5f6-0000-0000-0000-000000000000",
            name: "My Work",
            path: "My Queries/My Work",
            isFolder: false,
            isPublic: false,
          },
        ],
      },
    ]),
    ...witApiOverrides,
  };

  // biome-ignore lint/suspicious/noExplicitAny: test setup accesses private fields
  (adapter as any).witApi = witApi;
  // biome-ignore lint/suspicious/noExplicitAny: test setup accesses private fields
  (adapter as any).authenticated = true;

  return { adapter, witApi };
}

describe("AzureDevOpsAdapter — savedQuery", () => {
  describe("resolveAndRunSavedQuery (via queryWorkItems)", () => {
    test("resolves by ID and returns work items", async () => {
      const { adapter } = makeAdapter();
      const results = await adapter.queryWorkItems({
        savedQuery: { id: "a1b2c3d4-e5f6-47b8-8901-234567890123" },
      });
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe("Test Story");
    });

    test("resolves by path and returns work items", async () => {
      const { adapter } = makeAdapter();
      const results = await adapter.queryWorkItems({
        savedQuery: { path: "Shared Queries/Sprint Active Stories" },
      });
      expect(results).toHaveLength(1);
    });

    test("returns empty array when query matches no items", async () => {
      const { adapter } = makeAdapter({
        queryByWiql: mock(async () => ({ workItems: [] })),
      });
      const results = await adapter.queryWorkItems({
        savedQuery: { id: "a1b2c3d4-e5f6-47b8-8901-234567890123" },
      });
      expect(results).toHaveLength(0);
    });

    test("throws on 404 (query not found)", async () => {
      const { adapter } = makeAdapter({
        getQuery: mock(async () => {
          const err = new Error("Not found") as Error & { statusCode: number };
          err.statusCode = 404;
          throw err;
        }),
      });
      await expect(
        adapter.queryWorkItems({ savedQuery: { id: "missing-id" } }),
      ).rejects.toThrow("Query not found");
    });

    test("throws on 403 (access denied)", async () => {
      const { adapter } = makeAdapter({
        getQuery: mock(async () => {
          const err = new Error("Forbidden") as Error & { statusCode: number };
          err.statusCode = 403;
          throw err;
        }),
      });
      await expect(
        adapter.queryWorkItems({ savedQuery: { path: "Private/Query" } }),
      ).rejects.toThrow("Access denied");
    });

    test("throws when resolved item is a folder", async () => {
      const { adapter } = makeAdapter({
        getQuery: mock(async () => ({
          id: "a1b2c3d4-e5f6-47b8-8901-234567890123",
          name: "Shared Queries",
          isFolder: true,
        })),
      });
      await expect(
        adapter.queryWorkItems({ savedQuery: { path: "Shared Queries" } }),
      ).rejects.toThrow("query folder");
    });

    test("throws when query is a tree type", async () => {
      const { adapter } = makeAdapter({
        getQuery: mock(async () => ({
          id: "a1b2c3d4-e5f6-47b8-8901-234567890123",
          name: "Tree Query",
          isFolder: false,
          queryType: QueryType.Tree,
          wiql: "SELECT ...",
        })),
      });
      await expect(
        adapter.queryWorkItems({ savedQuery: { id: "a1b2c3d4-e5f6-47b8-8901-234567890123" } }),
      ).rejects.toThrow("tree");
    });

    test("throws when query has no WIQL", async () => {
      const { adapter } = makeAdapter({
        getQuery: mock(async () => ({
          id: "a1b2c3d4-e5f6-47b8-8901-234567890123",
          name: "Empty Query",
          isFolder: false,
          queryType: QueryType.Flat,
          wiql: undefined,
        })),
      });
      await expect(
        adapter.queryWorkItems({ savedQuery: { id: "a1b2c3d4-e5f6-47b8-8901-234567890123" } }),
      ).rejects.toThrow("no WIQL");
    });

    test("applies excludeIfHasTasks post-filter", async () => {
      const itemWithChild = {
        ...WORK_ITEM_STUB,
        id: 2,
        relations: [{ rel: "System.LinkTypes.Hierarchy-Forward", url: "/.../3" }],
      };
      const itemWithoutChild = { ...WORK_ITEM_STUB, id: 3 };

      const { adapter } = makeAdapter({
        queryByWiql: mock(async () => ({ workItems: [{ id: 2 }, { id: 3 }] })),
        getWorkItems: mock(async () => [itemWithChild, itemWithoutChild]),
      });

      const results = await adapter.queryWorkItems({
        savedQuery: { id: "a1b2c3d4-e5f6-47b8-8901-234567890123" },
        excludeIfHasTasks: true,
      });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("3");
    });

    test("applies limit post-filter", async () => {
      const { adapter } = makeAdapter({
        queryByWiql: mock(async () => ({ workItems: [{ id: 1 }, { id: 2 }, { id: 3 }] })),
        getWorkItems: mock(async () => [
          { ...WORK_ITEM_STUB, id: 1 },
          { ...WORK_ITEM_STUB, id: 2 },
          { ...WORK_ITEM_STUB, id: 3 },
        ]),
      });

      const results = await adapter.queryWorkItems({
        savedQuery: { id: "a1b2c3d4-e5f6-47b8-8901-234567890123" },
        limit: 2,
      });
      expect(results).toHaveLength(2);
    });
  });

  describe("listSavedQueries", () => {
    test("returns flat list of all queries", async () => {
      const { adapter } = makeAdapter();
      const queries = await adapter.listSavedQueries();
      expect(queries).toHaveLength(3);
      expect(queries.map((q) => q.name)).toEqual([
        "Sprint Active Stories",
        "Open Bugs",
        "My Work",
      ]);
    });

    test("scopes results by folder prefix", async () => {
      const { adapter } = makeAdapter();
      const queries = await adapter.listSavedQueries("Shared Queries");
      expect(queries).toHaveLength(2);
      expect(queries.every((q) => q.path.startsWith("Shared Queries"))).toBe(true);
    });

    test("returns isPublic correctly", async () => {
      const { adapter } = makeAdapter();
      const queries = await adapter.listSavedQueries();
      const shared = queries.filter((q) => q.isPublic);
      const mine = queries.filter((q) => !q.isPublic);
      expect(shared).toHaveLength(2);
      expect(mine).toHaveLength(1);
    });

    test("returns empty array when project has no queries", async () => {
      const { adapter } = makeAdapter({
        getQueries: mock(async () => []),
      });
      const queries = await adapter.listSavedQueries();
      expect(queries).toHaveLength(0);
    });

    test("returns empty array when folder filter matches nothing", async () => {
      const { adapter } = makeAdapter();
      const queries = await adapter.listSavedQueries("Nonexistent Folder");
      expect(queries).toHaveLength(0);
    });
  });
});
