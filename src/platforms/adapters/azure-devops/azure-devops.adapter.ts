import { logger } from "@config/logger";
import type { ADoFieldSchema } from "@platforms/interfaces/field-schema.interface";
import type { FilterCriteria } from "@platforms/interfaces/filter.interface";
import type {
  AuthConfig,
  IPlatformAdapter,
  PlatformConfig,
  PlatformMetadata,
  SavedQueryInfo,
} from "@platforms/interfaces/platform.interface";
import type {
  TaskDefinition,
  WorkItem,
} from "@platforms/interfaces/work-item.interface";
import { ConfigurationError, getErrorMessage, PlatformError, UnknownError } from "@utils/errors";
import * as azdev from "azure-devops-node-api";
import {
  type WorkItem as AzureWorkItem,
  QueryExpand,
  type QueryHierarchyItem,
  QueryType,
  TreeStructureGroup,
  WorkItemErrorPolicy,
  WorkItemExpand,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import type { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import { FieldSchemaService } from "./azure-devops-field-schema.service.js";
import { buildCreateTaskPatch, buildDependencyLinkPatch } from "./task-patch-builder";
import { convertWorkItem, hasChildRelations } from "./work-item-mapper";
import {
  buildWorkItemWiqlQuery,
  workItemQueryRequiresTeam,
} from "./work-item-query";

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

  /** Team name (can be overridden per-template via filter.team) */
  team: string;

  /** API version (optional) */
  apiVersion?: string;

  /** Maximum concurrent API requests for bulk operations (default: 5) */
  maxConcurrency?: number;
}

/** Extracts an HTTP status code from an ADO SDK error, if present. */
function getHttpStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.statusCode === "number") return e.statusCode;
    if (typeof e.status === "number") return e.status;
  }
  return undefined;
}

/**
 * Azure DevOps Platform Adapter
 * Connects to Azure DevOps Services using the REST API
 */
export class AzureDevOpsAdapter implements IPlatformAdapter {
  private connection?: azdev.WebApi;
  private witApi?: IWorkItemTrackingApi;
  private authenticated = false;
  private readonly fieldSchemaService: FieldSchemaService;

  constructor(
    private config: AzureDevOpsConfig,
    fieldSchemaService?: FieldSchemaService,
  ) {
    this.fieldSchemaService = fieldSchemaService ?? new FieldSchemaService();
    if (!config.organizationUrl) {
      throw new PlatformError("Organization URL is required", "azure-devops");
    }
    if (!config.project) {
      throw new PlatformError("Project name is required", "azure-devops");
    }
    if (!config.token) {
      throw new PlatformError(
        "Personal Access Token is required",
        "azure-devops",
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
        this.config.token,
      );

      this.connection = new azdev.WebApi(
        this.config.organizationUrl.replace(/\/+$/, ""),
        authHandler,
      );

      this.witApi = await this.connection.getWorkItemTrackingApi();

      await this.testConnection();

      this.authenticated = true;
      logger.info("AzureDevOps: Authentication successful");
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error("AzureDevOps: Authentication failed", { error: message });
      throw new PlatformError(
        `Authentication failed: ${message}`,
        "azure-devops",
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

    if (filter.workItemIds && filter.workItemIds.length > 0) {
      return this.fetchWorkItemsByIds(filter.workItemIds, filter);
    }

    if (filter.savedQuery) {
      return this.resolveAndRunSavedQuery(filter.savedQuery, filter);
    }

    try {
      logger.debug("AzureDevOps: Querying work items");

      const wiql = this.buildWiqlQuery(filter);
      logger.debug("AzureDevOps: WIQL query built");
      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }

      const effectiveTeam = filter.team ?? this.config.team;
      if (workItemQueryRequiresTeam(filter) && !effectiveTeam) {
        throw new ConfigurationError(
          "A team is required when using @CurrentIteration or @TeamAreas macros. " +
            "Set AZURE_DEVOPS_TEAM in your environment or add 'team' to the template filter.",
        );
      }

      const result = await this.witApi.queryByWiql(
        { query: wiql },
        { project: this.config.project, team: effectiveTeam },
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
        this.config.project,
      );

      let filtered = workItems.filter((wi) => wi !== null) as AzureWorkItem[];

      logger.debug(
        `Excluding work items with tasks: ${filter.excludeIfHasTasks}`,
      );
      if (filter.excludeIfHasTasks) {
        const itemsWithoutTasks: AzureWorkItem[] = [];

        for (const item of filtered) {
          if (!item.id) continue;
          const hasChildren = hasChildRelations(item);
          logger.debug(`Work item ${item.id} has children: ${hasChildren}`);
          if (!hasChildren) {
            itemsWithoutTasks.push(item);
          }
        }

        filtered = itemsWithoutTasks;
        logger.info(
          `AzureDevOps: ${filtered.length} work item(s) without tasks`,
        );
      }

      // Apply limit
      if (filter.limit) {
        filtered = filtered.slice(0, filter.limit);
      }

      const converted = filtered.map((wi) => convertWorkItem(wi));

      logger.info(`AzureDevOps: Returning ${converted.length} work item(s)`);
      return converted;
    } catch (error) {
      const message = getErrorMessage(error);
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
        this.config.project,
      );

      if (!workItem) {
        logger.warn(`AzureDevOps: Work item ${id} not found`);
        return null;
      }

      return convertWorkItem(workItem);
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`AzureDevOps: Failed to get work item ${id}`, {
        error: message,
      });
      return null;
    }
  }

  private async fetchWorkItemsByIds(
    ids: string[],
    filter: FilterCriteria,
  ): Promise<WorkItem[]> {
    try {
      const numericIds = ids
        .map((id) => parseInt(id, 10))
        .filter((id) => !Number.isNaN(id));

      if (numericIds.length === 0) {
        logger.warn("AzureDevOps: No valid numeric IDs provided");
        return [];
      }

      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }

      logger.info(`AzureDevOps: Fetching ${numericIds.length} work item(s) by ID`);

      const workItems = await this.witApi.getWorkItems(
        numericIds,
        undefined,
        undefined,
        WorkItemExpand.All,
        undefined,
        this.config.project,
      );

      let filtered = workItems.filter((wi) => wi !== null) as AzureWorkItem[];

      if (filter.excludeIfHasTasks) {
        filtered = filtered.filter((item) => !hasChildRelations(item));
        logger.info(
          `AzureDevOps: ${filtered.length} work item(s) without tasks (after excludeIfHasTasks)`,
        );
      }

      return filtered.map((wi) => convertWorkItem(wi));
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error("AzureDevOps: Failed to fetch work items by ID", { error: message });
      throw new PlatformError(`Failed to fetch work items by ID: ${message}`, "azure-devops");
    }
  }

  /**
   * Create a single task
   */
  async createTask(parentId: string, task: TaskDefinition): Promise<WorkItem> {
    this.ensureAuthenticated();

    try {
      logger.debug(`AzureDevOps: Creating task for parent ${parentId}`, {
        taskTitle: task.title,
        assignTo: task.assignTo,
      });

      const numericParentId = parseInt(parentId, 10);
      if (Number.isNaN(numericParentId)) {
        throw new Error(`Invalid parent ID: ${parentId}`);
      }

      const patchDocument = buildCreateTaskPatch(
        this.config.organizationUrl,
        numericParentId,
        task,
      );

      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }
      // Create work item
      const createdItem = await this.witApi.createWorkItem(
        undefined, // customHeaders
        patchDocument,
        this.config.project,
        "Task", // work item type
      );

      logger.info(`AzureDevOps: Created task ${createdItem.id}: ${task.title}`);

      return convertWorkItem(createdItem);
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`AzureDevOps: Failed to create task`, { error: message });
      throw new PlatformError(
        `Failed to create task: ${message}`,
        "azure-devops",
      );
    }
  }

  /**
   * Create multiple tasks in bulk with parallel execution
   * Uses concurrency limit to avoid overwhelming the API
   */
  async createTasksBulk(
    parentId: string,
    tasks: TaskDefinition[],
  ): Promise<WorkItem[]> {
    this.ensureAuthenticated();

    const concurrency = this.config.maxConcurrency ?? 5;
    logger.debug(
      `AzureDevOps: Creating ${tasks.length} tasks for parent ${parentId} (concurrency: ${concurrency})`,
    );

    const results: (WorkItem | null)[] = new Array(tasks.length).fill(null);

    // Process tasks in parallel batches
    for (let i = 0; i < tasks.length; i += concurrency) {
      const batch = tasks.slice(i, i + concurrency);
      const batchPromises = batch.map(async (task, batchIndex) => {
        const taskIndex = i + batchIndex;
        try {
          const created = await this.createTask(parentId, task);
          results[taskIndex] = created;
          return created;
        } catch (error) {
          logger.error(`AzureDevOps: Failed to create task: ${task.title}`, {
            error,
          });
          results[taskIndex] = null;
          return null;
        }
      });

      await Promise.all(batchPromises);
    }

    const createdTasks = results.filter((r): r is WorkItem => r !== null);

    logger.info(
      `AzureDevOps: Created ${createdTasks.length} of ${tasks.length} tasks`,
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

      await this.witApi.queryByWiql(
        {
          query:
            "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project",
        },
        { project: this.config.project },
        false,
        1,
      );

      logger.info("Connection test succeeded");
      return true;
    } catch (error) {
      logger.debug(getErrorMessage(error));
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
        this.config.project,
      );

      if (!parent?.relations) {
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
        this.config.project,
      );

      return children
        .filter((c) => c !== null)
        .map((c) => convertWorkItem(c));
    } catch (error) {
      logger.error(`AzureDevOps: Failed to get children for ${parentId}`, {
        error,
      });
      return [];
    }
  }

  /**
   * Create a dependency link between two work items
   * @param dependentId - The ID of the task that depends on another
   * @param predecessorId - The ID of the task that must be completed first
   */
  async createDependencyLink(
    dependentId: string,
    predecessorId: string,
  ): Promise<void> {
    this.ensureAuthenticated();

    try {
      logger.debug(
        `AzureDevOps: Creating dependency link: ${dependentId} depends on ${predecessorId}`,
      );

      const numericDependentId = parseInt(dependentId, 10);
      const numericPredecessorId = parseInt(predecessorId, 10);

      if (Number.isNaN(numericDependentId)) {
        throw new Error(`Invalid dependent work item ID: ${dependentId}`);
      }
      if (Number.isNaN(numericPredecessorId)) {
        throw new Error(`Invalid predecessor work item ID: ${predecessorId}`);
      }

      const patchDocument = buildDependencyLinkPatch(
        this.config.organizationUrl,
        numericPredecessorId,
      );

      if (!this.witApi) {
        throw new UnknownError("Work Item Tracking API not initialized");
      }

      await this.witApi.updateWorkItem(
        undefined, // customHeaders
        patchDocument,
        numericDependentId,
        this.config.project,
      );

      logger.info(
        `AzureDevOps: Created dependency link: ${dependentId} -> ${predecessorId}`,
      );
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(
        `AzureDevOps: Failed to create dependency link between ${dependentId} and ${predecessorId}`,
        { error: message },
      );
      throw new PlatformError(
        `Failed to create dependency link: ${message}`,
        "azure-devops",
      );
    }
  }

  /**
   * Fetch a saved query by ID or path and return its WIQL string.
   * Throws PlatformError with actionable messages for all failure modes.
   */
  private async resolveSavedQueryWiql(savedQuery: {
    id?: string;
    path?: string;
  }): Promise<string> {
    if (!this.witApi) {
      throw new UnknownError("Work Item Tracking API not initialized");
    }

    const queryRef = savedQuery.id ?? savedQuery.path ?? "";
    const label = savedQuery.path ?? savedQuery.id ?? queryRef;
    logger.debug(`AzureDevOps: Resolving saved query "${queryRef}"`);

    let queryItem: QueryHierarchyItem;
    try {
      queryItem = await this.witApi.getQuery(
        this.config.project,
        queryRef,
        QueryExpand.Wiql,
      );
    } catch (err) {
      const status = getHttpStatusCode(err);
      if (status === 401 || status === 403) {
        throw new PlatformError(
          `Access denied to query "${label}". Ensure your PAT includes the Work Items (Read) scope.`,
          "azure-devops",
        );
      }
      // 404, network errors, and anything else: surface as not-found
      // (ADO returns 404 for missing, private-to-others, and wrong-project queries)
      throw new PlatformError(
        `Query not found: "${label}". Verify the ID or path and that the query has been shared with your account.`,
        "azure-devops",
      );
    }

    if (!queryItem) {
      throw new PlatformError(
        `Query not found: "${label}". Verify the ID or path and that the query has been shared with your account.`,
        "azure-devops",
      );
    }

    if (queryItem.isFolder) {
      throw new PlatformError(
        `"${label}" is a query folder, not a runnable query. Specify a query, not a folder path.`,
        "azure-devops",
      );
    }

    if (queryItem.queryType !== undefined && queryItem.queryType !== QueryType.Flat) {
      const kind = queryItem.queryType === QueryType.Tree ? "tree" : "one-hop";
      throw new PlatformError(
        `Only flat (Work Items) queries are supported. "${label}" is a ${kind} query.`,
        "azure-devops",
      );
    }

    if (!queryItem.wiql) {
      throw new PlatformError(
        `Saved query "${label}" has no WIQL content and cannot be executed.`,
        "azure-devops",
      );
    }

    return queryItem.wiql;
  }

  /**
   * Resolve a saved query by ID or path, execute its WIQL, and return work items.
   */
  private async resolveAndRunSavedQuery(
    savedQuery: { id?: string; path?: string },
    filter: FilterCriteria,
  ): Promise<WorkItem[]> {
    if (!this.witApi) {
      throw new UnknownError("Work Item Tracking API not initialized");
    }

    const wiql = await this.resolveSavedQueryWiql(savedQuery);

    logger.debug(`AzureDevOps: Executing WIQL from saved query`);
    const effectiveTeam = filter.team ?? this.config.team;
    const result = await this.witApi.queryByWiql(
      { query: wiql },
      { project: this.config.project, team: effectiveTeam },
    );

    if (!result.workItems || result.workItems.length === 0) {
      logger.info("AzureDevOps: Saved query returned no work items");
      return [];
    }

    const ids = result.workItems
      .map((wi) => wi.id)
      .filter((id): id is number => id !== undefined);
    logger.info(`AzureDevOps: Saved query matched ${ids.length} work item(s)`);

    const workItems = await this.witApi.getWorkItems(
      ids,
      undefined,
      undefined,
      WorkItemExpand.All,
      undefined,
      this.config.project,
    );

    let filtered = workItems.filter((wi) => wi !== null) as AzureWorkItem[];

    if (filter.excludeIfHasTasks) {
      filtered = filtered.filter((item) => !hasChildRelations(item));
      logger.info(
        `AzureDevOps: ${filtered.length} work item(s) without tasks (after excludeIfHasTasks)`,
      );
    }

    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered.map((wi) => convertWorkItem(wi));
  }

  /**
   * List saved queries in the project, optionally scoped to a folder path prefix.
   */
  async listSavedQueries(folder?: string): Promise<SavedQueryInfo[]> {
    this.ensureAuthenticated();

    if (!this.witApi) {
      throw new UnknownError("Work Item Tracking API not initialized");
    }

    // Depth 2: top-level folders (My Queries, Shared Queries) + their immediate children
    const roots = await this.witApi.getQueries(
      this.config.project,
      QueryExpand.None,
      2,
    );

    if (!roots) return [];

    const results: SavedQueryInfo[] = [];

    const flatten = (items: QueryHierarchyItem[]) => {
      for (const item of items) {
        if (item.isFolder) {
          if (item.children) flatten(item.children);
        } else {
          const itemPath = item.path ?? item.name ?? "";
          if (!folder || itemPath.startsWith(folder)) {
            results.push({
              id: item.id ?? "",
              name: item.name ?? "",
              path: itemPath,
              isPublic: item.isPublic ?? false,
            });
          }
        }
      }
    };

    flatten(roots);
    return results;
  }

  async getFieldSchemas(workItemType?: string): Promise<ADoFieldSchema[]> {
    this.ensureAuthenticated();

    if (!this.witApi) {
      throw new UnknownError("Work Item Tracking API not initialized");
    }

    const profileKey = `${this.config.organizationUrl}::${this.config.project}`;

    if (workItemType) {
      return this.fieldSchemaService.getFieldsForType(
        this.witApi,
        this.config.project,
        workItemType,
        profileKey,
      );
    }

    return this.fieldSchemaService.getAllFields(
      this.witApi,
      this.config.project,
      profileKey,
    );
  }

  /**
   * Returns the list of work item type names available in the project.
   */
  async getWorkItemTypes(): Promise<string[]> {
    this.ensureAuthenticated();

    if (!this.witApi) {
      throw new UnknownError("Work Item Tracking API not initialized");
    }

    const types = await this.witApi.getWorkItemTypes(this.config.project);
    return types.map((t) => t.name).filter((n): n is string => !!n).sort();
  }

  /**
   * Returns the available state names for a given work item type in the project.
   */
  async getStatesForWorkItemType(workItemType: string): Promise<string[]> {
    this.ensureAuthenticated();

    if (!this.witApi) {
      throw new UnknownError("Work Item Tracking API not initialized");
    }

    const states = await this.witApi.getWorkItemTypeStates(this.config.project, workItemType);
    return states.map((s) => s.name).filter((n): n is string => !!n);
  }

  /**
   * Returns all area paths in the project as flat strings (e.g. "MyProject\\Backend\\API").
   */
  async getAreaPaths(): Promise<string[]> {
    this.ensureAuthenticated();

    if (!this.connection) {
      throw new UnknownError("Not connected to Azure DevOps");
    }

    const witApi = await this.connection.getWorkItemTrackingApi();
    const root = await witApi.getClassificationNode(
      this.config.project,
      TreeStructureGroup.Areas,
      undefined,
      10, // depth
    );
    return flattenClassificationNode(root, this.config.project);
  }

  /**
   * Returns all iteration paths in the project as flat strings.
   */
  async getIterationPaths(): Promise<string[]> {
    this.ensureAuthenticated();

    if (!this.connection) {
      throw new UnknownError("Not connected to Azure DevOps");
    }

    const witApi = await this.connection.getWorkItemTrackingApi();
    const root = await witApi.getClassificationNode(
      this.config.project,
      TreeStructureGroup.Iterations,
      undefined,
      10, // depth
    );
    return flattenClassificationNode(root, this.config.project);
  }

  /**
   * Returns team names in the project.
   */
  async getTeams(): Promise<string[]> {
    this.ensureAuthenticated();

    if (!this.connection) {
      throw new UnknownError("Not connected to Azure DevOps");
    }

    const coreApi = await this.connection.getCoreApi();
    const teams = await coreApi.getTeams(this.config.project, false, 1000);
    return teams.map((t) => t.name).filter((n): n is string => !!n).sort();
  }

  /**
   * Build WIQL query from filter criteria.
   *
   * Kept as a thin wrapper for existing tests and internal callers; the query
   * planning implementation lives in work-item-query.ts.
   */
  private buildWiqlQuery(filter: FilterCriteria): string {
    return buildWorkItemWiqlQuery(filter, this.config.project);
  }

  /**
   * Ensure authenticated before operations
   */
  private ensureAuthenticated(): void {
    if (!this.authenticated || !this.witApi) {
      throw new PlatformError(
        "Not authenticated. Call authenticate() first.",
        "azure-devops",
      );
    }
  }
}

/**
 * Recursively flattens a WorkItemClassificationNode tree into path strings.
 * The root node represents the project itself, so the root path is just the project name.
 */
function flattenClassificationNode(
  node: import("azure-devops-node-api/interfaces/WorkItemTrackingInterfaces").WorkItemClassificationNode,
  parentPath: string,
): string[] {
  const paths: string[] = [parentPath];
  if (node.children) {
    for (const child of node.children) {
      if (child.name) {
        const childPath = `${parentPath}\\${child.name}`;
        paths.push(...flattenClassificationNode(child, childPath));
      }
    }
  }
  return paths;
}
