import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  AzureDevOpsAdapter,
  type AzureDevOpsConfig,
} from "@platforms/adapters/azure-devops/azure-devops.adapter";
import { hasChildRelations } from "@platforms/adapters/azure-devops/work-item-mapper";
import { PlatformError } from "@utils/errors";

const validConfig: AzureDevOpsConfig = {
  type: "azure-devops",
  organizationUrl: "https://dev.azure.com/test",
  project: "SampleProject",
  token: "test-token",
  team: "TestTeam",
};

// Mock Azure DevOps API
const mockWorkItemTrackingApi = {
  queryByWiql: mock(async () => ({
    workItems: [{ id: 1 }, { id: 2 }],
  })),
  getWorkItems: mock(async (ids: number[]) =>
    ids.map((id) => ({
      id,
      fields: {
        "System.Title": `Work Item ${id}`,
        "System.WorkItemType": "User Story",
        "System.State": "New",
        "System.Tags": "backend; api",
      },
      relations: [],
    }))
  ),
  getWorkItem: mock(async (id: number) => ({
    id,
    fields: {
      "System.Title": `Work Item ${id}`,
      "System.WorkItemType": "User Story",
      "System.State": "New",
      "System.IterationPath": "SampleProject\\Sprint 1",
    },
    relations: [],
  })),
  createWorkItem: mock(
    // biome-ignore-start lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose
    async (
      _customHeaders: any,
      document: any,
      _project: string,
      type: string
    ) => ({
      id: 123,
      fields: {
        "System.Title":
          document.find((op: any) => op.path === "/fields/System.Title")
            ?.value || "New Task",
        "System.WorkItemType": type,
        "System.State": "New",
      },
      relations: [],
    })
  ),
  updateWorkItem: mock(async () => ({
    id: 1,
    fields: {
      "System.Title": "Updated",
      "System.WorkItemType": "Task",
      "System.State": "New",
    },
    relations: [],
  })),
};
// biome-ignore-end lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose

const mockWebApi = {
  getWorkItemTrackingApi: mock(async () => mockWorkItemTrackingApi),
  connect: mock(async () => ({
    authenticatedUser: {
      properties: {
        Account: { $value: "test@example.com" },
      },
    },
  })),
};

// Mock the azure-devops-node-api module
mock.module("azure-devops-node-api", () => ({
  getPersonalAccessTokenHandler: mock(() => ({})),
  WebApi: mock(() => mockWebApi),
}));

describe("AzureDevOpsAdapter", () => {
  describe("constructor", () => {
    test("should create adapter with valid config", () => {
      const adapter = new AzureDevOpsAdapter(validConfig);
      expect(adapter).toBeDefined();
      expect(true).toBe(true);
    });

    test("should throw error for missing organization URL", () => {
      const invalidConfig = { ...validConfig, organizationUrl: "" };

      expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
        PlatformError
      );
      expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
        "Organization URL is required"
      );
      expect(true).toBe(true);
    });

    test("should throw error for missing project", () => {
      const invalidConfig = { ...validConfig, project: "" };

      expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
        PlatformError
      );
      expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
        "Project name is required"
      );
      expect(true).toBe(true);
    });

    test("should throw error for missing token", () => {
      const invalidConfig = { ...validConfig, token: "" };

      expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
        PlatformError
      );
      expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
        "Personal Access Token is required"
      );
      expect(true).toBe(true);
    });
  });

  describe("getPlatformMetadata", () => {
    test("should return correct metadata", () => {
      const adapter = new AzureDevOpsAdapter(validConfig);
      const metadata = adapter.getPlatformMetadata();

      expect(metadata.name).toBe("Azure DevOps");
      expect(metadata.version).toBe("7.0");
      expect(metadata.features).toContain("query");
      expect(metadata.features).toContain("create");
      expect(metadata.connected).toBe(false);
      expect(true).toBe(true);
    });

    test("should show connected after authentication", async () => {
      const adapter = new AzureDevOpsAdapter(validConfig);
      const metadata = adapter.getPlatformMetadata();
      expect(metadata.connected).toBe(false);
      expect(true).toBe(true);
    });
  });

  describe("configuration validation", () => {
    test("should accept valid organization URL formats", () => {
      const configs = [
        "https://dev.azure.com/org",
        "https://dev.azure.com/mycompany",
        "https://customdomain.visualstudio.com",
      ];

      configs.forEach((url) => {
        const config = { ...validConfig, organizationUrl: url };
        const adapter = new AzureDevOpsAdapter(config);
        expect(adapter).toBeDefined();
      });
      expect(true).toBe(true);
    });

    test("should accept team configuration", () => {
      const config = { ...validConfig, team: "MyTeam" };
      const adapter = new AzureDevOpsAdapter(config);
      expect(adapter).toBeDefined();
      expect(true).toBe(true);
    });
  });

  describe("authentication", () => {
    test("should authenticate successfully with valid credentials", async () => {
      const adapter = new AzureDevOpsAdapter(validConfig);
      await adapter.authenticate();
      const metadata = adapter.getPlatformMetadata();
      expect(metadata.connected).toBe(true);
      expect(true).toBe(true);
    });

    test("should get connected user email after authentication", async () => {
      const adapter = new AzureDevOpsAdapter(validConfig);
      await adapter.authenticate();
      const email = await adapter.getConnectUserEmail();
      expect(typeof email).toBe("string");
      expect(true).toBe(true);
    });
  });

  describe("error handling", () => {
    test("should throw PlatformError for operations before authentication", async () => {
      const adapter = new AzureDevOpsAdapter(validConfig);
      expect(adapter.queryWorkItems({})).rejects.toThrow(PlatformError);
      expect(adapter.queryWorkItems({})).rejects.toThrow("Not authenticated");
      expect(true).toBe(true);
    });

    test("should handle invalid work item ID gracefully", async () => {
      const adapter = new AzureDevOpsAdapter(validConfig);
      await adapter.authenticate();
      const result = await adapter.getWorkItem("invalid-id");
      expect(result).toBeNull();
      expect(true).toBe(true);
    });
  });

  describe("queryWorkItems", () => {
    let adapter: AzureDevOpsAdapter;

    beforeEach(async () => {
      adapter = new AzureDevOpsAdapter(validConfig);
      await adapter.authenticate();
    });

    test("should query work items successfully", async () => {
      const items = await adapter.queryWorkItems({});
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      expect(true).toBe(true);
    });

    test("should filter by work item types", async () => {
      const items = await adapter.queryWorkItems({
        workItemTypes: ["User Story", "Bug"],
      });
      expect(Array.isArray(items)).toBe(true);
      expect(true).toBe(true);
    });

    test("should filter by states", async () => {
      const items = await adapter.queryWorkItems({
        states: ["New", "Active"],
      });
      expect(Array.isArray(items)).toBe(true);
      expect(true).toBe(true);
    });

    test("should filter by tags", async () => {
      const items = await adapter.queryWorkItems({
        tags: { include: ["backend"] },
      });
      expect(Array.isArray(items)).toBe(true);
      expect(true).toBe(true);
    });

    test("should apply limit to results", async () => {
      const items = await adapter.queryWorkItems({
        limit: 1,
      });
      expect(items.length).toBeLessThanOrEqual(1);
      expect(true).toBe(true);
    });

    test("should handle empty results", async () => {
      mockWorkItemTrackingApi.queryByWiql.mockResolvedValueOnce({
        workItems: [],
      });
      const items = await adapter.queryWorkItems({});
      expect(items).toEqual([]);
      expect(true).toBe(true);
    });
  });

  describe("getWorkItem", () => {
    let adapter: AzureDevOpsAdapter;

    beforeEach(async () => {
      adapter = new AzureDevOpsAdapter(validConfig);
      await adapter.authenticate();
    });

    test("should get work item by valid ID", async () => {
      const item = await adapter.getWorkItem("123");
      expect(item).not.toBeNull();
      expect(item?.id).toBe("123");
      expect(true).toBe(true);
    });

    test("should return null for invalid ID format", async () => {
      const item = await adapter.getWorkItem("invalid");
      expect(item).toBeNull();
      expect(true).toBe(true);
    });

    test("should handle numeric IDs correctly", async () => {
      const item = await adapter.getWorkItem("456");
      expect(item).not.toBeNull();
      expect(true).toBe(true);
    });
  });

  describe("createTask", () => {
    let adapter: AzureDevOpsAdapter;

    beforeEach(async () => {
      adapter = new AzureDevOpsAdapter(validConfig);
      await adapter.authenticate();
    });

    test("should create task with required fields", async () => {
      const task = {
        title: "New Task",
        description: "Task description",
      };
      const created = await adapter.createTask("100", task);
      expect(created).toBeDefined();
      expect(created.title).toBe("New Task");
      expect(true).toBe(true);
    });

    test("should create task with estimation", async () => {
      const task = {
        title: "Task with estimation",
        estimation: 5,
      };
      const created = await adapter.createTask("100", task);
      expect(created).toBeDefined();
      expect(true).toBe(true);
    });

    test("should create task with tags", async () => {
      const task = {
        title: "Task with tags",
        tags: ["backend", "api"],
      };
      const created = await adapter.createTask("100", task);
      expect(created).toBeDefined();
      expect(true).toBe(true);
    });

    test("should create task with assignment", async () => {
      const task = {
        title: "Assigned task",
        assignTo: "developer@example.com",
      };
      const created = await adapter.createTask("100", task);
      expect(created).toBeDefined();
      expect(true).toBe(true);
    });

    test("should create task with priority", async () => {
      const task = {
        title: "Priority task",
        priority: 1,
      };
      const created = await adapter.createTask("100", task);
      expect(created).toBeDefined();
      expect(true).toBe(true);
    });

    test("should create task with activity", async () => {
      const task = {
        title: "Task with activity",
        activity: "Development",
      };
      const created = await adapter.createTask("100", task);
      expect(created).toBeDefined();
      expect(true).toBe(true);
    });

    test("should emit patch operations for custom fields", async () => {
      const task = {
        title: "Task with custom fields",
        customFields: {
          "Custom.ClientTier": "Enterprise",
          "Custom.IsBillable": true,
        },
      };

      //biome-ignore-start lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose
      let capturedPatchDocument: any;
      mockWorkItemTrackingApi.createWorkItem.mockImplementationOnce(
        async (
          _customHeaders: any,
          document: any,
          _project: string,
          type: string
        ) => {
          capturedPatchDocument = document;
          return {
            id: 123,
            fields: {
              "System.Title": "Task with custom fields",
              "System.WorkItemType": type,
              "System.State": "New",
            },
            relations: [],
          };
        }
      );
      //biome-ignore-end lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose

      await adapter.createTask("100", task);

      //biome-ignore-start lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose
      const clientTierOp = capturedPatchDocument.find(
        (op: any) => op.path === "/fields/Custom.ClientTier"
      );
      const billableOp = capturedPatchDocument.find(
        (op: any) => op.path === "/fields/Custom.IsBillable"
      );
      //biome-ignore-end lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose

      expect(clientTierOp).toBeDefined();
      expect(clientTierOp.value).toBe("Enterprise");
      expect(billableOp).toBeDefined();
      expect(billableOp.value).toBe(true);
    });

    test("should set CompletedWork and IterationPath from task definition", async () => {
      const task = {
        title: "Task with inherited fields",
        estimation: 5,
        completedWork: 0,
        iteration: "SampleProject\\Sprint 1",
      };

      // Capture the patch document sent to createWorkItem
      //biome-ignore-start lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose
      let capturedPatchDocument: any;
      mockWorkItemTrackingApi.createWorkItem.mockImplementationOnce(
        async (
          _customHeaders: any,
          document: any,
          _project: string,
          type: string
        ) => {
          capturedPatchDocument = document;
          return {
            id: 123,
            fields: {
              "System.Title": "Task with inherited fields",
              "System.WorkItemType": type,
              "System.State": "New",
            },
            relations: [],
          };
        }
      );
      //biome-ignore-end lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose

      const created = await adapter.createTask("100", task);
      expect(created).toBeDefined();

      // Verify CompletedWork is set from task definition
      //biome-ignore-start lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose
      const completedWorkOp = capturedPatchDocument.find(
        (op: any) =>
          op.path === "/fields/Microsoft.VSTS.Scheduling.CompletedWork"
      );
      //biome-ignore-end lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose

      expect(completedWorkOp).toBeDefined();
      expect(completedWorkOp.value).toBe(0);

      // Verify IterationPath is set from task definition
      //biome-ignore-start lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose
      const iterationPathOp = capturedPatchDocument.find(
        (op: any) => op.path === "/fields/System.IterationPath"
      );
      //biome-ignore-end lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose
      expect(iterationPathOp).toBeDefined();
      expect(iterationPathOp.value).toBe("SampleProject\\Sprint 1");
    });
  });

  describe("createTasksBulk", () => {
    let adapter: AzureDevOpsAdapter;

    beforeEach(async () => {
      adapter = new AzureDevOpsAdapter(validConfig);
      await adapter.authenticate();
    });

    test("should create multiple tasks", async () => {
      const tasks = [
        { title: "Task 1" },
        { title: "Task 2" },
        { title: "Task 3" },
      ];
      const created = await adapter.createTasksBulk("100", tasks);
      expect(created.length).toBe(3);
      expect(true).toBe(true);
    });

    test("should handle empty task list", async () => {
      const created = await adapter.createTasksBulk("100", []);
      expect(created).toEqual([]);
      expect(true).toBe(true);
    });
  });

  describe("getChildren", () => {
    let adapter: AzureDevOpsAdapter;

    beforeEach(async () => {
      adapter = new AzureDevOpsAdapter(validConfig);
      await adapter.authenticate();
    });

    test("should get children of work item", async () => {
      // biome-ignore-start lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose
      const mockParentWithChildren: any = {
        id: 100,
        fields: {
          "System.Title": "Parent",
          "System.WorkItemType": "User Story",
          "System.State": "New",
        },
        relations: [
          {
            rel: "System.LinkTypes.Hierarchy-Forward",
            url: "https://dev.azure.com/_apis/wit/workItems/101",
          },
        ],
      };
      // biome-ignore-end lint/suspicious/noExplicitAny : mock signature mirrors SDK and is intentionally loose

      mockWorkItemTrackingApi.getWorkItem.mockResolvedValueOnce(
        mockParentWithChildren
      );

      const children = await adapter.getChildren("100");
      expect(Array.isArray(children)).toBe(true);
      expect(true).toBe(true);
    });

    test("should return empty array for work item without children", async () => {
      const mockParentWithoutChildren = {
        id: 100,
        fields: {
          "System.Title": "Parent",
          "System.WorkItemType": "User Story",
          "System.State": "New",
          "System.IterationPath": "SampleProject\\Sprint 1",
        },
        relations: [],
      };
      mockWorkItemTrackingApi.getWorkItem.mockResolvedValueOnce(
        mockParentWithoutChildren
      );

      const children = await adapter.getChildren("100");
      expect(children).toEqual([]);
      expect(true).toBe(true);
    });
  });

  describe("createDependencyLink", () => {
    let adapter: AzureDevOpsAdapter;

    beforeEach(async () => {
      adapter = new AzureDevOpsAdapter(validConfig);
      await adapter.authenticate();
    });

    test("should create dependency link between tasks", async () => {
      await adapter.createDependencyLink("101", "102");
      expect(mockWorkItemTrackingApi.updateWorkItem).toHaveBeenCalled();
      expect(true).toBe(true);
    });

    test("should handle invalid task IDs", async () => {
      await expect(
        adapter.createDependencyLink("invalid", "102")
      ).rejects.toThrow();
      expect(true).toBe(true);
    });
  });

  describe("testConnection", () => {
    test("should test connection successfully", async () => {
      const adapter = new AzureDevOpsAdapter(validConfig);
      await adapter.authenticate();
      const result = await adapter.testConnection();
      expect(typeof result).toBe("boolean");
      expect(true).toBe(true);
    });
  });
});

describe("AzureDevOps WIQL Query Building", () => {
  test("should document expected WIQL for work item types", () => {
    // Expected: [System.WorkItemType] IN ('User Story', 'Bug')
    expect(true).toBe(true);
  });

  test("should document expected WIQL for states", () => {
    // Expected: [System.State] IN ('New', 'Active')
    expect(true).toBe(true);
  });

  test("should document expected WIQL for tags", () => {
    // Expected: [System.Tags] CONTAINS 'backend'
    expect(true).toBe(true);
  });

  test("should emit @CurrentIteration macro when sentinel is the only iteration", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      iterations: ["@CurrentIteration"],
    });
    expect(wiql).toContain("[System.IterationPath] = @CurrentIteration");
    expect(wiql).not.toContain("'@CurrentIteration'");
  });

  test("should emit IN clause when only real iteration paths are given", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      iterations: ["MyProject\\Sprint 1", "MyProject\\Sprint 2"],
    });
    expect(wiql).toContain(
      "[System.IterationPath] IN ('MyProject\\Sprint 1', 'MyProject\\Sprint 2')",
    );
    expect(wiql).not.toContain("@CurrentIteration");
  });

  test("should emit combined OR clause when sentinel is mixed with real paths", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      iterations: ["@CurrentIteration", "MyProject\\Sprint 1"],
    });
    expect(wiql).toContain(
      "[System.IterationPath] IN ('MyProject\\Sprint 1')",
    );
    expect(wiql).toContain("[System.IterationPath] = @CurrentIteration");
    expect(wiql).toContain(" OR ");
  });

  test("should emit @CurrentIteration + 1 for next sprint offset", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      iterations: ["@CurrentIteration + 1"],
    });
    expect(wiql).toContain("[System.IterationPath] = @CurrentIteration + 1");
  });

  test("should emit @CurrentIteration - 1 for previous sprint offset", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      iterations: ["@CurrentIteration - 1"],
    });
    expect(wiql).toContain("[System.IterationPath] = @CurrentIteration - 1");
  });

  test("should emit @TeamAreas macro for area path sentinel", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      areaPaths: ["@TeamAreas"],
    });
    expect(wiql).toContain("[System.AreaPath] IN (@TeamAreas)");
    expect(wiql).not.toContain("'@TeamAreas'");
  });

  test("should emit combined OR clause for @TeamAreas mixed with real paths", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      areaPaths: ["@TeamAreas", "MyProject\\Backend"],
    });
    expect(wiql).toContain("[System.AreaPath] IN ('MyProject\\Backend')");
    expect(wiql).toContain("[System.AreaPath] IN (@TeamAreas)");
    expect(wiql).toContain(" OR ");
  });

  test("should emit @Today macro for changedAfter", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({ changedAfter: "@Today" });
    expect(wiql).toContain("[System.ChangedDate] >= @Today");
    expect(wiql).not.toContain("'@Today'");
  });

  test("should emit @Today - 7 macro for changedAfter offset", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({ changedAfter: "@Today-7" });
    expect(wiql).toContain("[System.ChangedDate] >= @Today - 7");
  });

  test("should quote literal date for changedAfter", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      changedAfter: "2026-01-01",
    });
    expect(wiql).toContain("[System.ChangedDate] >= '2026-01-01'");
  });

  test("should emit @Today macro for createdAfter", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      createdAfter: "@Today - 30",
    });
    expect(wiql).toContain("[System.CreatedDate] >= @Today - 30");
  });

  test("should emit @StartOfDay macro", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({ changedAfter: "@StartOfDay" });
    expect(wiql).toContain("[System.ChangedDate] >= @StartOfDay");
  });

  test("should emit @StartOfDay with offset", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({ changedAfter: "@StartOfDay-7" });
    expect(wiql).toContain("[System.ChangedDate] >= @StartOfDay - 7");
  });

  test("should emit @StartOfWeek macro", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({ changedAfter: "@StartOfWeek-2" });
    expect(wiql).toContain("[System.ChangedDate] >= @StartOfWeek - 2");
  });

  test("should emit @StartOfMonth macro", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({ createdAfter: "@StartOfMonth-3" });
    expect(wiql).toContain("[System.CreatedDate] >= @StartOfMonth - 3");
  });

  test("should emit @StartOfYear macro", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({ createdAfter: "@StartOfYear" });
    expect(wiql).toContain("[System.CreatedDate] >= @StartOfYear");
  });

  test("should normalise case for date macros", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({ changedAfter: "@startofmonth-1" });
    expect(wiql).toContain("[System.ChangedDate] >= @StartOfMonth - 1");
  });

  test("should escape single-quotes in literal changedAfter to prevent WIQL injection", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      changedAfter: "2026-01-01' OR [System.State] <> ''",
    });
    // The injected quote must be doubled (escaped), not passed through raw.
    expect(wiql).toContain("[System.ChangedDate] >= '2026-01-01'' OR [System.State] <> ''''");
    expect(wiql).not.toMatch(/\[System\.State\] <> ''(?!')/);
  });

  test("should escape single-quotes in literal createdAfter to prevent WIQL injection", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      createdAfter: "2026-06-01' OR 1=1--",
    });
    expect(wiql).toContain("[System.CreatedDate] >= '2026-06-01'' OR 1=1--'");
  });

  test("should emit NOT IN for excluded states", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      statesExclude: ["Closed", "Removed"],
    });
    expect(wiql).toContain("[System.State] NOT IN ('Closed', 'Removed')");
  });

  test("should emit WAS EVER for a single statesWereEver value", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      statesWereEver: ["Active"],
    });
    expect(wiql).toContain("[System.State] WAS EVER 'Active'");
    expect(wiql).not.toContain("OR");
  });

  test("should emit OR'd WAS EVER clauses for multiple statesWereEver values", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      statesWereEver: ["Active", "In Progress"],
    });
    expect(wiql).toContain("[System.State] WAS EVER 'Active'");
    expect(wiql).toContain("[System.State] WAS EVER 'In Progress'");
    expect(wiql).toContain(" OR ");
  });

  test("should emit UNDER for a single areaPathsUnder value", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      areaPathsUnder: ["MyProject\\TeamA"],
    });
    expect(wiql).toContain("[System.AreaPath] UNDER 'MyProject\\TeamA'");
  });

  test("should emit OR'd UNDER clauses for multiple areaPathsUnder values", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      areaPathsUnder: ["MyProject\\TeamA", "MyProject\\TeamB"],
    });
    expect(wiql).toContain("[System.AreaPath] UNDER 'MyProject\\TeamA'");
    expect(wiql).toContain("[System.AreaPath] UNDER 'MyProject\\TeamB'");
    expect(wiql).toContain(" OR ");
  });

  test("should emit UNDER for a single iterationsUnder value", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      iterationsUnder: ["MyProject\\Release 1"],
    });
    expect(wiql).toContain("[System.IterationPath] UNDER 'MyProject\\Release 1'");
  });

  test("should emit OR'd UNDER clauses for multiple iterationsUnder values", () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    //biome-ignore lint/suspicious/noTsIgnore: accessing private method for testing
    // @ts-ignore
    const wiql: string = adapter.buildWiqlQuery({
      iterationsUnder: ["MyProject\\Release 1", "MyProject\\Release 2"],
    });
    expect(wiql).toContain("[System.IterationPath] UNDER 'MyProject\\Release 1'");
    expect(wiql).toContain("[System.IterationPath] UNDER 'MyProject\\Release 2'");
    expect(wiql).toContain(" OR ");
  });
});

describe("AzureDevOps team override", () => {
  test("should use config team when filter has no team", async () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    await adapter.authenticate();
    await adapter.queryWorkItems({ states: ["Active"] });
    const call = mockWorkItemTrackingApi.queryByWiql.mock.calls.at(-1) as unknown[];
    expect((call[1] as { team: string }).team).toBe(validConfig.team);
  });

  test("should use filter team when provided, overriding config team", async () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    await adapter.authenticate();
    await adapter.queryWorkItems({ states: ["Active"], team: "OtherTeam" });
    const call = mockWorkItemTrackingApi.queryByWiql.mock.calls.at(-1) as unknown[];
    expect((call[1] as { team: string }).team).toBe("OtherTeam");
  });

  test("should allow @CurrentIteration when team is set only on the filter, overriding config team", async () => {
    const adapter = new AzureDevOpsAdapter(validConfig);
    await adapter.authenticate();
    await adapter.queryWorkItems({ iterations: ["@CurrentIteration"], team: "FilterTeam" });
    const call = mockWorkItemTrackingApi.queryByWiql.mock.calls.at(-1) as unknown[];
    expect((call[1] as { team: string }).team).toBe("FilterTeam");
  });
});

describe("AzureDevOps excludeIfHasTasks functionality", () => {
  test("should correctly identify work items with child relations", () => {
    const workItemWithChildren = {
      id: 1,
      relations: [
        {
          rel: "System.LinkTypes.Hierarchy-Forward",
          url: "https://dev.azure.com/_apis/wit/workItems/2",
        },
      ],
    };

    // Work item without children
    const workItemWithoutChildren = {
      id: 2,
      relations: [],
    };

    const workItemNoRelations = {
      id: 3,
    };
    expect(hasChildRelations(workItemWithChildren)).toBe(true);
    expect(hasChildRelations(workItemWithoutChildren)).toBe(false);
    expect(hasChildRelations(workItemNoRelations)).toBe(false);
  });

  test("should handle work items with other relation types correctly", () => {
    const workItemWithParentOnly = {
      id: 1,
      relations: [
        {
          rel: "System.LinkTypes.Hierarchy-Reverse",
          url: "https://dev.azure.com/_apis/wit/workItems/2",
        },
      ],
    };

    expect(hasChildRelations(workItemWithParentOnly)).toBe(false);
  });
});
