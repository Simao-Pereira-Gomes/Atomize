import { logger } from "@config/logger";
import type { FilterCriteria } from "@platforms/interfaces/filter.interface";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { ConfigurationError, PlatformError } from "@utils/errors";
import {
  type WorkItem as AzureWorkItem,
  QueryExpand,
  type QueryHierarchyItem,
  QueryType,
  WorkItemExpand,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import type { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import { convertWorkItem, hasChildRelations } from "./work-item-mapper";
import {
  buildWorkItemWiqlQuery,
  workItemQueryRequiresTeam,
} from "./work-item-query";

export interface AzureDevOpsRetrievalConfig {
  project: string;
  team: string;
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
 * Owns the read-side retrieval policy for Azure DevOps Work Items.
 *
 * All query modes converge here: template filters, explicit Story IDs, and
 * saved queries all resolve IDs, fetch full Work Items, apply Atomize
 * post-filters, and map into the platform-neutral WorkItem shape.
 */
export class AzureDevOpsWorkItemRetrieval {
  constructor(
    private readonly witApi: IWorkItemTrackingApi,
    private readonly config: AzureDevOpsRetrievalConfig,
  ) {}

  async query(filter: FilterCriteria): Promise<WorkItem[]> {
    if (filter.workItemIds && filter.workItemIds.length > 0) {
      return this.fetchWorkItemsByIds(filter.workItemIds, filter);
    }

    if (filter.savedQuery) {
      return this.runSavedQuery(filter.savedQuery, filter);
    }

    return this.runFilterQuery(filter);
  }

  private async runFilterQuery(filter: FilterCriteria): Promise<WorkItem[]> {
    const effectiveTeam = this.resolveEffectiveTeam(filter);
    const wiql = buildWorkItemWiqlQuery(filter, this.config.project);
    logger.debug("AzureDevOps: WIQL query built");

    const result = await this.witApi.queryByWiql(
      { query: wiql },
      { project: this.config.project, team: effectiveTeam },
    );

    return this.hydrateQueryResult(result.workItems, filter, {
      emptyMessage: "AzureDevOps: No work items found",
      matchedMessage: (count) => `AzureDevOps: Found ${count} work item(s)`,
    });
  }

  private async fetchWorkItemsByIds(
    ids: string[],
    filter: FilterCriteria,
  ): Promise<WorkItem[]> {
    const numericIds = ids
      .map((id) => parseInt(id, 10))
      .filter((id) => !Number.isNaN(id));

    if (numericIds.length === 0) {
      logger.warn("AzureDevOps: No valid numeric IDs provided");
      return [];
    }

    logger.info(`AzureDevOps: Fetching ${numericIds.length} work item(s) by ID`);
    const workItems = await this.getWorkItems(numericIds);
    return this.applyPostFilters(workItems, filter).map((wi) =>
      convertWorkItem(wi),
    );
  }

  private async runSavedQuery(
    savedQuery: { id?: string; path?: string },
    filter: FilterCriteria,
  ): Promise<WorkItem[]> {
    const wiql = await this.resolveSavedQueryWiql(savedQuery);

    logger.debug("AzureDevOps: Executing WIQL from saved query");
    const result = await this.witApi.queryByWiql(
      { query: wiql },
      { project: this.config.project, team: this.resolveEffectiveTeam(filter) },
    );

    return this.hydrateQueryResult(result.workItems, filter, {
      emptyMessage: "AzureDevOps: Saved query returned no work items",
      matchedMessage: (count) =>
        `AzureDevOps: Saved query matched ${count} work item(s)`,
    });
  }

  private async hydrateQueryResult(
    refs: Array<{ id?: number }> | undefined,
    filter: FilterCriteria,
    messages: {
      emptyMessage: string;
      matchedMessage: (count: number) => string;
    },
  ): Promise<WorkItem[]> {
    if (!refs || refs.length === 0) {
      logger.info(messages.emptyMessage);
      return [];
    }

    const ids = refs
      .map((wi) => wi.id)
      .filter((id): id is number => id !== undefined);
    logger.info(messages.matchedMessage(ids.length));

    const workItems = await this.getWorkItems(ids);
    const filtered = this.applyPostFilters(workItems, filter);
    const converted = filtered.map((wi) => convertWorkItem(wi));

    logger.info(`AzureDevOps: Returning ${converted.length} work item(s)`);
    return converted;
  }

  private async getWorkItems(ids: number[]): Promise<AzureWorkItem[]> {
    const workItems = await this.witApi.getWorkItems(
      ids,
      undefined,
      undefined,
      WorkItemExpand.All,
      undefined,
      this.config.project,
    );

    return workItems.filter((wi) => wi !== null) as AzureWorkItem[];
  }

  private applyPostFilters(
    workItems: AzureWorkItem[],
    filter: FilterCriteria,
  ): AzureWorkItem[] {
    let filtered = workItems;

    if (filter.excludeIfHasTasks) {
      filtered = filtered.filter((item) => !hasChildRelations(item));
      logger.info(
        `AzureDevOps: ${filtered.length} work item(s) without tasks (after excludeIfHasTasks)`,
      );
    }

    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  private resolveEffectiveTeam(filter: FilterCriteria): string | undefined {
    const effectiveTeam = filter.team ?? this.config.team;
    if (workItemQueryRequiresTeam(filter) && !effectiveTeam) {
      throw new ConfigurationError(
        "A team is required when using @CurrentIteration or @TeamAreas macros. " +
          "Set AZURE_DEVOPS_TEAM in your environment or add 'team' to the template filter.",
      );
    }
    return effectiveTeam;
  }

  /**
   * Fetch a saved query by ID or path and return its WIQL string.
   * Throws PlatformError with actionable messages for all failure modes.
   */
  private async resolveSavedQueryWiql(savedQuery: {
    id?: string;
    path?: string;
  }): Promise<string> {
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
}
