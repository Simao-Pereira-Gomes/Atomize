import { logger } from "@config/logger";
import type { FilterCriteria } from "@platforms/interfaces/filter.interface";
import type {
  AuthConfig,
  IPlatformAdapter,
  PlatformConfig,
  PlatformMetadata,
} from "@platforms/interfaces/platform.interface";
import type {
  TaskDefinition,
  WorkItem,
  WorkItemType,
} from "@platforms/interfaces/work-item.interface";
import { PlatformError, UnknownError } from "@utils/errors";
import * as azdev from "azure-devops-node-api";
import type { JsonPatchDocument } from "azure-devops-node-api/interfaces/common/VSSInterfaces";
import {
  type WorkItem as AzureWorkItem,
  WorkItemErrorPolicy,
  WorkItemExpand,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import type { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";

/**
 * Azure DevOps specific configuration
 */
export interface AzureDevOpsConfig extends PlatformConfig {
  /** Organization URL (e.g., https://dev.azure.com/myorg) */
  organizationUrl: string;

  /** Project name */
  project: string;

  /** Personal Access Token for authentication */
  token: string;

  /** Team (optional) */
  team?: string;

  /** API version (optional) */
  apiVersion?: string;
}

/**
 * Azure DevOps Platform Adapter
 * Connects to Azure DevOps Services using the REST API
 */
export class AzureDevOpsAdapter implements IPlatformAdapter {
  private connection?: azdev.WebApi;
  private witApi?: IWorkItemTrackingApi;
  private authenticated = false;

  constructor(private config: AzureDevOpsConfig) {
    if (!config.organizationUrl) {
      throw new PlatformError("Organization URL is required", "azure-devops");
    }
    if (!config.project) {
      throw new PlatformError("Project name is required", "azure-devops");
    }
    if (!config.token) {
      throw new PlatformError(
        "Personal Access Token is required",
        "azure-devops"
      );
    }
  }

  /**
   * Authenticate with Azure DevOps using Personal Access Token
   */
  async authenticate(_config?: AuthConfig): Promise<void> {
    try {
      logger.info("AzureDevOps: Authenticating...");

      const authHandler = azdev.getPersonalAccessTokenHandler(
        this.config.token
      );

      this.connection = new azdev.WebApi(
        this.config.organizationUrl,
        authHandler
      );

      this.witApi = await this.connection.getWorkItemTrackingApi();

      await this.testConnection();

      this.authenticated = true;
      logger.info("AzureDevOps: Authentication successful");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("AzureDevOps: Authentication failed", { error: message });
      throw new PlatformError(
        `Authentication failed: ${message}`,
        "azure-devops"
      );
    }
  }

  async getConnectUserEmail(): Promise<string> {
    if (!this.connection) {
      throw new UnknownError("Not connected to Azure DevOps");
    }
    const connectionData = await this.connection.connect();
    return connectionData.authenticatedUser?.properties?.Account?.$value || "";
  }

  /**
   * Query work items based on filter criteria
   */
  async queryWorkItems(filter: FilterCriteria): Promise<WorkItem[]> {
    this.ensureAuthenticated();

    try {
      logger.debug("AzureDevOps: Querying work items", { filter });

      const wiql = this.buildWiqlQuery(filter);
      logger.debug("AzureDevOps: WIQL query", { wiql });
      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }

      const result = await this.witApi.queryByWiql(
        { query: wiql },
        { project: this.config.project }
      );

      if (!result.workItems || result.workItems.length === 0) {
        logger.info("AzureDevOps: No work items found");
        return [];
      }

      const ids = result.workItems
        .map((wi) => wi.id)
        .filter((id): id is number => id !== undefined);
      logger.info(`AzureDevOps: Found ${ids.length} work item(s)`);

      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }
      const workItems = await this.witApi.getWorkItems(
        ids,
        undefined,
        undefined,
        WorkItemExpand.All,
        undefined,
        this.config.project
      );

      let filtered = workItems.filter((wi) => wi !== null) as AzureWorkItem[];

      if (filter.excludeIfHasTasks) {
        const itemsWithoutTasks: AzureWorkItem[] = [];

        for (const item of filtered) {
          if (!item.id) continue;
          const hasChildren = await this.hasChildWorkItems(item.id);
          if (!hasChildren) {
            itemsWithoutTasks.push(item);
          }
        }

        filtered = itemsWithoutTasks;
        logger.info(
          `AzureDevOps: ${filtered.length} work item(s) without tasks`
        );
      }

      // Apply limit
      if (filter.limit) {
        filtered = filtered.slice(0, filter.limit);
      }

      const converted = filtered.map((wi) => this.convertWorkItem(wi));

      logger.info(`AzureDevOps: Returning ${converted.length} work item(s)`);
      return converted;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("AzureDevOps: Query failed", { error: message });
      throw new PlatformError(`Query failed: ${message}`, "azure-devops");
    }
  }

  /**
   * Get a single work item by ID
   */
  async getWorkItem(id: string): Promise<WorkItem | null> {
    this.ensureAuthenticated();

    try {
      logger.debug(`AzureDevOps: Getting work item ${id}`);

      const numericId = parseInt(id, 10);
      if (Number.isNaN(numericId)) {
        throw new Error(`Invalid work item ID: ${id}`);
      }

      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }

      const workItem = await this.witApi.getWorkItem(
        numericId,
        undefined,
        undefined,
        WorkItemExpand.All,
        this.config.project
      );

      if (!workItem) {
        logger.warn(`AzureDevOps: Work item ${id} not found`);
        return null;
      }

      return this.convertWorkItem(workItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`AzureDevOps: Failed to get work item ${id}`, {
        error: message,
      });
      return null;
    }
  }

  /**
   * Create a single task
   */
  async createTask(parentId: string, task: TaskDefinition): Promise<WorkItem> {
    this.ensureAuthenticated();

    try {
      logger.debug(`AzureDevOps: Creating task for parent ${parentId}`, {
        task,
      });

      const numericParentId = parseInt(parentId, 10);
      console.log("Assigning task to:", task.assignTo);
      if (Number.isNaN(numericParentId)) {
        throw new Error(`Invalid parent ID: ${parentId}`);
      }

      const patchDocument: JsonPatchDocument = [
        // Title
        {
          op: "add",
          path: "/fields/System.Title",
          value: task.title,
        },
        ...(task.description
          ? [
              {
                op: "add",
                path: "/fields/System.Description",
                value: task.description,
              },
            ]
          : []),
        // Estimation (Story Points or Remaining Work)
        ...(task.estimation !== undefined
          ? [
              {
                op: "add",
                path: "/fields/Microsoft.VSTS.Scheduling.RemainingWork",
                value: task.estimation,
              },
            ]
          : []),
        // Tags
        ...(task.tags && task.tags.length > 0
          ? [
              {
                op: "add",
                path: "/fields/System.Tags",
                value: task.tags.join("; "),
              },
            ]
          : []),
        // Assignment
        ...(task.assignTo
          ? [
              {
                op: "add",
                path: "/fields/System.AssignedTo",
                value: task.assignTo,
              },
            ]
          : []),
        // Priority
        ...(task.priority !== undefined
          ? [
              {
                op: "add",
                path: "/fields/Microsoft.VSTS.Common.Priority",
                value: task.priority,
              },
            ]
          : []),
        // Activity
        ...(task.activity
          ? [
              {
                op: "add",
                path: "/fields/Microsoft.VSTS.Common.Activity",
                value: task.activity,
              },
            ]
          : []),
        // Parent link
        {
          op: "add",
          path: "/relations/-",
          value: {
            rel: "System.LinkTypes.Hierarchy-Reverse",
            url: `${this.config.organizationUrl}/_apis/wit/workItems/${numericParentId}`,
            attributes: {
              comment: "Parent link",
            },
          },
        },
      ];

      // Add custom fields
      if (task.customFields) {
        for (const [field, value] of Object.entries(task.customFields)) {
          // biome-ignore lint : The any type is used here for flexibility
          (patchDocument as Array<any>).push({
            op: "add",
            path: `/fields/${field}`,
            value,
          });
        }
      }

      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }
      // Create work item
      const createdItem = await this.witApi.createWorkItem(
        undefined, // customHeaders
        patchDocument,
        this.config.project,
        "Task" // work item type
      );

      logger.info(`AzureDevOps: Created task ${createdItem.id}: ${task.title}`);

      return this.convertWorkItem(createdItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`AzureDevOps: Failed to create task`, { error: message });
      throw new PlatformError(
        `Failed to create task: ${message}`,
        "azure-devops"
      );
    }
  }

  /**
   * Create multiple tasks in bulk
   */
  async createTasksBulk(
    parentId: string,
    tasks: TaskDefinition[]
  ): Promise<WorkItem[]> {
    this.ensureAuthenticated();

    logger.debug(
      `AzureDevOps: Creating ${tasks.length} tasks for parent ${parentId}`
    );

    const createdTasks: WorkItem[] = [];

    for (const task of tasks) {
      try {
        const created = await this.createTask(parentId, task);
        createdTasks.push(created);
      } catch (error) {
        logger.error(`AzureDevOps: Failed to create task: ${task.title}`, {
          error,
        });
        // Continue with other tasks
      }
    }

    logger.info(
      `AzureDevOps: Created ${createdTasks.length} of ${tasks.length} tasks`
    );

    return createdTasks;
  }

  /**
   * Get platform metadata
   */
  getPlatformMetadata(): PlatformMetadata {
    return {
      name: "Azure DevOps",
      version: "7.0",
      features: ["query", "create", "update", "delete", "relations"],
      connected: this.authenticated,
    };
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.witApi) {
        return false;
      }

      console.log("Testing connection to Azure DevOps...");
      await this.witApi.queryByWiql(
        {
          query:
            "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project",
        },
        { project: this.config.project },
        false,
        1
      );

      console.log("Connection test succeeded");
      return true;
    } catch (error) {
      logger.debug((error as Error).message);
      return false;
    }
  }

  /**
   * Get child work items
   */
  async getChildren(parentId: string): Promise<WorkItem[]> {
    this.ensureAuthenticated();

    try {
      const numericId = parseInt(parentId, 10);
      if (Number.isNaN(numericId)) {
        throw new UnknownError(`Invalid parent ID: ${parentId}`);
      }

      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }

      const parent = await this.witApi.getWorkItem(
        numericId,
        undefined,
        undefined,
        WorkItemExpand.All,
        this.config.project
      );

      if (!parent || !parent.relations) {
        return [];
      }

      const childIds: number[] = [];
      for (const relation of parent.relations) {
        if (relation.rel === "System.LinkTypes.Hierarchy-Forward") {
          const url = relation.url || "";
          const match = url.match(/\/(\d+)$/);
          if (match?.[1]) {
            childIds.push(parseInt(match[1], 10));
          }
        }
      }

      if (childIds.length === 0) {
        return [];
      }

      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }

      const children = await this.witApi.getWorkItems(
        childIds,
        undefined,
        undefined,
        WorkItemExpand.All,
        WorkItemErrorPolicy.Fail,
        this.config.project
      );

      return children
        .filter((c) => c !== null)
        .map((c) => this.convertWorkItem(c));
    } catch (error) {
      logger.error(`AzureDevOps: Failed to get children for ${parentId}`, {
        error,
      });
      return [];
    }
  }

  /**
   * Build WIQL query from filter criteria
   */
  private buildWiqlQuery(filter: FilterCriteria): string {
    const conditions: string[] = [];

    conditions.push(`[System.TeamProject] = '${this.config.project}'`);

    // Work item types
    if (filter.workItemTypes && filter.workItemTypes.length > 0) {
      const types = filter.workItemTypes.map((t) => `'${t}'`).join(", ");
      conditions.push(`[System.WorkItemType] IN (${types})`);
    }

    // States
    if (filter.states && filter.states.length > 0) {
      const states = filter.states.map((s) => `'${s}'`).join(", ");
      conditions.push(`[System.State] IN (${states})`);
    }

    // Tags (include)
    if (filter.tags?.include && filter.tags.include.length > 0) {
      const tagConditions = filter.tags.include.map(
        (tag) => `[System.Tags] CONTAINS '${tag}'`
      );
      conditions.push(`(${tagConditions.join(" OR ")})`);
    }

    // Area paths
    if (filter.areaPaths && filter.areaPaths.length > 0) {
      const paths = filter.areaPaths.map((p) => `'${p}'`).join(", ");
      conditions.push(`[System.AreaPath] IN (${paths})`);
    }

    // Iterations
    if (filter.iterations && filter.iterations.length > 0) {
      const iterations = filter.iterations.map((i) => `'${i}'`).join(", ");
      conditions.push(`[System.IterationPath] IN (${iterations})`);
    }

    // Assigned to
    if (filter.assignedTo && filter.assignedTo.length > 0) {
      const users = filter.assignedTo.map((u) => `'${u}'`).join(", ");
      conditions.push(`[System.AssignedTo] IN (${users})`);
    }

    // Priority
    if (filter.priority) {
      if (filter.priority.min !== undefined) {
        conditions.push(
          `[Microsoft.VSTS.Common.Priority] >= ${filter.priority.min}`
        );
      }
      if (filter.priority.max !== undefined) {
        conditions.push(
          `[Microsoft.VSTS.Common.Priority] <= ${filter.priority.max}`
        );
      }
    }

    // Custom query (if provided, use it instead)
    if (filter.customQuery) {
      return filter.customQuery;
    }

    const whereClause = conditions.join(" AND ");
    return `SELECT [System.Id] FROM WorkItems WHERE ${whereClause}`;
  }

  /**
   * Convert Azure DevOps work item to common format
   */
  private convertWorkItem(azureItem: AzureWorkItem): WorkItem {
    const fields = azureItem.fields || {};

    return {
      id: azureItem.id?.toString() || "",
      title: fields["System.Title"] || "",
      type: fields["System.WorkItemType"] as WorkItemType,
      state: fields["System.State"] || "",
      assignedTo:
        fields["System.AssignedTo"]?.uniqueName ||
        fields["System.AssignedTo"]?.displayName,
      estimation:
        fields["Microsoft.VSTS.Scheduling.StoryPoints"] ||
        fields["Microsoft.VSTS.Scheduling.RemainingWork"],
      tags: fields["System.Tags"] ? fields["System.Tags"].split("; ") : [],
      description: fields["System.Description"],
      areaPath: fields["System.AreaPath"],
      iteration: fields["System.IterationPath"],
      priority: fields["Microsoft.VSTS.Common.Priority"],
      customFields: fields,
      createdDate: fields["System.CreatedDate"]
        ? new Date(fields["System.CreatedDate"])
        : undefined,
      updatedDate: fields["System.ChangedDate"]
        ? new Date(fields["System.ChangedDate"])
        : undefined,
      platformSpecific: {
        url: azureItem.url,
        rev: azureItem.rev,
        relations: azureItem.relations,
      },
    };
  }

  /**
   * Check if work item has child items
   */
  private async hasChildWorkItems(id: number): Promise<boolean> {
    try {
      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }
      const workItem = await this.witApi.getWorkItem(
        id,
        undefined,
        undefined,
        WorkItemExpand.All,
        this.config.project
      );

      if (!workItem || !workItem.relations) {
        return false;
      }

      // Check for child relations
      return workItem.relations.some(
        (rel) => rel.rel === "System.LinkTypes.Hierarchy-Forward"
      );
    } catch (error) {
      logger.error(`Failed to check children for ${id}`, { error });
      return false;
    }
  }

  /**
   * Ensure authenticated before operations
   */
  private ensureAuthenticated(): void {
    if (!this.authenticated || !this.witApi) {
      throw new PlatformError(
        "Not authenticated. Call authenticate() first.",
        "azure-devops"
      );
    }
  }
}
