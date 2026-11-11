import {
  type WorkItem as AzureWorkItem,
  QueryExpand,
  type QueryHierarchyItem,
  QueryType,
  WorkItemExpand,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import type { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import { logger } from "../../../logger";
import { runWithConcurrency } from "../../../utils/concurrency";
import { ConfigurationError, PlatformError } from "../../../utils/errors";
import type { FilterCriteria } from "../../interfaces/filter.interface";
import type { QueryWorkItemsOptions } from "../../interfaces/platform-capabilities";
import type { StorySearch } from "../../interfaces/story-search.interface";
import type { WorkItem } from "../../interfaces/work-item.interface";
import { childIds, convertWorkItem, hasChildRelations } from "./work-item-mapper";
import {
  buildStorySearchWiql,
  buildWorkItemWiqlQuery,
  workItemQueryRequiresTeam,
} from "./work-item-query";

/** Azure DevOps returns at most 200 Work Items per batch fetch. */
const MAX_BATCH_FETCH = 200;
/**
 * How many candidate IDs a Story Search considers when a Task post-filter may discard some. Only IDs
 * come back from the query; Work Items are fetched batch by batch until the page fills, so a page
 * isn't left short (hiding "Load more") just because few recent Stories have Tasks.
 */
const MAX_SEARCH_CANDIDATES = 5000;
/** Batch fetches run at once; enough to overlap round trips without a burst Azure DevOps throttles. */
const FETCH_CONCURRENCY = 3;

export interface AzureDevOpsRetrievalConfig {
  project: string;
  team: string;
  /** Used to build each Story's web link, since Story fetches don't ask for `_links`. */
  organizationUrl?: string;
  /** The team's current and next sprint paths, for a Story Search with `currentAndNextSprint`. */
  sprintIterations?: () => Promise<string[]>;
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

  async query(filter: FilterCriteria, options: QueryWorkItemsOptions = {}): Promise<WorkItem[]> {
    if (filter.workItemIds && filter.workItemIds.length > 0) {
      return this.fetchWorkItemsByIds(filter.workItemIds, filter, options);
    }

    if (filter.savedQuery) {
      return this.runSavedQuery(filter.savedQuery, filter, options);
    }

    return this.runFilterQuery(filter, options);
  }

  /** Runs a Story Search: newest first, capped, optionally keeping only Stories with or without Tasks. */
  async search(search: StorySearch): Promise<WorkItem[]> {
    if (search.currentAndNextSprint && !this.config.team) {
      throw new ConfigurationError(
        "Listing the current and next sprint needs a team. Add a team to this Connection Profile, or search instead.",
      );
    }

    let sprintIterations: string[] = [];
    if (search.currentAndNextSprint) {
      if (!this.config.sprintIterations) throw new ConfigurationError("This connection can't list the team's sprints.");
      sprintIterations = await this.config.sprintIterations();
      // No current sprint: there is nothing to list, and an empty IN () isn't valid WIQL.
      if (sprintIterations.length === 0) return [];
    }

    // Tasks are checked after fetching, so consider more candidates to still fill the page.
    const postFiltered = search.hasTasks !== undefined;
    const top = postFiltered ? Math.max(search.limit, MAX_SEARCH_CANDIDATES) : search.limit;
    const result = await this.witApi.queryByWiql(
      { query: buildStorySearchWiql(search, this.config.project, sprintIterations) },
      { project: this.config.project, team: this.config.team },
      undefined,
      top,
    );
    const ids = (result.workItems ?? [])
      .map((ref) => ref.id)
      .filter((id): id is number => id !== undefined)
      .slice(0, top);

    const matching = await this.fetchMatching(
      ids,
      search.limit,
      postFiltered ? (item) => hasChildRelations(item) === search.hasTasks : undefined,
    );
    return matching.map((item) => convertWorkItem(item, this.config.organizationUrl));
  }

  private async runFilterQuery(filter: FilterCriteria, options: QueryWorkItemsOptions): Promise<WorkItem[]> {
    const effectiveTeam = this.resolveEffectiveTeam(filter);
    const wiql = buildWorkItemWiqlQuery(filter, this.config.project);
    logger.debug("AzureDevOps: WIQL query built");

    const result = await this.witApi.queryByWiql(
      { query: wiql },
      { project: this.config.project, team: effectiveTeam },
      undefined,
      queryTop(filter),
    );

    return this.hydrateQueryResult(result.workItems, filter, options, {
      emptyMessage: "AzureDevOps: No work items found",
      matchedMessage: (count) => `AzureDevOps: Found ${count} work item(s)`,
    });
  }

  private async fetchWorkItemsByIds(
    ids: string[],
    filter: FilterCriteria,
    options: QueryWorkItemsOptions,
  ): Promise<WorkItem[]> {
    const numericIds = ids
      .map((id) => parseInt(id, 10))
      .filter((id) => !Number.isNaN(id));

    if (numericIds.length === 0) {
      logger.warn("AzureDevOps: No valid numeric IDs provided");
      return [];
    }

    logger.info(`AzureDevOps: Fetching ${numericIds.length} work item(s) by ID`);
    return await this.fetchFiltered(numericIds, filter, options);
  }

  private async runSavedQuery(
    savedQuery: { id?: string; path?: string },
    filter: FilterCriteria,
    options: QueryWorkItemsOptions,
  ): Promise<WorkItem[]> {
    const wiql = await this.resolveSavedQueryWiql(savedQuery);

    logger.debug("AzureDevOps: Executing WIQL from saved query");
    const result = await this.witApi.queryByWiql(
      { query: wiql },
      { project: this.config.project, team: this.resolveEffectiveTeam(filter) },
      undefined,
      queryTop(filter),
    );

    return this.hydrateQueryResult(result.workItems, filter, options, {
      emptyMessage: "AzureDevOps: Saved query returned no work items",
      matchedMessage: (count) =>
        `AzureDevOps: Saved query matched ${count} work item(s)`,
    });
  }

  private async hydrateQueryResult(
    refs: Array<{ id?: number }> | undefined,
    filter: FilterCriteria,
    options: QueryWorkItemsOptions,
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

    const converted = await this.fetchFiltered(ids, filter, options);

    logger.info(`AzureDevOps: Returning ${converted.length} work item(s)`);
    return converted;
  }

  /**
   * Fetches the Work Items for `ids`, applying excludeIfHasTasks and limit without over-fetching.
   * With `taskWorkItemTypes`, only children of those types count as Tasks, which needs the children
   * themselves: they are read round by round, only for Stories that have any.
   */
  private async fetchFiltered(ids: number[], filter: FilterCriteria, options: QueryWorkItemsOptions): Promise<WorkItem[]> {
    const taskTypes = filter.taskWorkItemTypes?.length ? new Set(filter.taskWorkItemTypes) : undefined;
    const readsChildren = taskTypes !== undefined && (filter.excludeIfHasTasks || filter.includeTaskChildren);
    const children = new Map<number, AzureWorkItem>();
    const childTasks = (item: AzureWorkItem) =>
      childIds(item).flatMap((id) => {
        const child = children.get(id);
        return child && taskTypes?.has(child.fields?.["System.WorkItemType"]) ? [child] : [];
      });
    const convert = (item: AzureWorkItem): WorkItem => {
      const converted = convertWorkItem(item, this.config.organizationUrl);
      if (!readsChildren) return converted;
      const tasks = childTasks(item).map((child) => convertWorkItem(child, this.config.organizationUrl));
      return { ...converted, children: tasks, childCount: tasks.length };
    };
    const hasTasks = (item: AzureWorkItem) => (readsChildren ? childTasks(item).length > 0 : hasChildRelations(item));

    const fetched = await this.fetchMatching(
      ids,
      filter.limit || undefined,
      filter.excludeIfHasTasks
        ? (item) => {
            if (!hasTasks(item)) return true;
            options.onExcluded?.(convert(item));
            return false;
          }
        : undefined,
      readsChildren ? (round) => this.readChildren(round, children) : undefined,
    );
    if (filter.excludeIfHasTasks) {
      logger.info(`AzureDevOps: ${fetched.length} work item(s) without tasks (after excludeIfHasTasks)`);
    }
    return fetched.map(convert);
  }

  /** Reads the children of `stories` into `into`, 200 per batch fetch, a few at a time. */
  private async readChildren(stories: AzureWorkItem[], into: Map<number, AzureWorkItem>): Promise<void> {
    const ids = [...new Set(stories.flatMap(childIds))].filter((id) => !into.has(id));
    const chunks: number[][] = [];
    for (let start = 0; start < ids.length; start += MAX_BATCH_FETCH) chunks.push(ids.slice(start, start + MAX_BATCH_FETCH));
    await runWithConcurrency(chunks, FETCH_CONCURRENCY, async (chunk) => {
      for (const child of await this.getWorkItemBatch(chunk, WorkItemExpand.Fields)) {
        if (child.id !== undefined) into.set(child.id, child);
      }
    });
  }

  /**
   * Fetches Work Items for `ids` in `ids` order, keeping those that pass `keep`, and stops once
   * `limit` are kept. Chunks of 200 run a few at a time. Without `keep`, only the first `limit` IDs
   * are fetched; with it, the first round fetches what would fill the limit if every item passed,
   * and later rounds go a few chunks wide since the filter is discarding items.
   */
  private async fetchMatching(
    ids: number[],
    limit: number | undefined,
    keep?: (item: AzureWorkItem) => boolean,
    /** Runs on each round's Work Items before `keep` sees them. */
    prepare?: (round: AzureWorkItem[]) => Promise<void>,
  ): Promise<AzureWorkItem[]> {
    const candidates = limit !== undefined && !keep ? ids.slice(0, limit) : ids;
    const chunks: number[][] = [];
    for (let start = 0; start < candidates.length; start += MAX_BATCH_FETCH) {
      chunks.push(candidates.slice(start, start + MAX_BATCH_FETCH));
    }

    const kept: AzureWorkItem[] = [];
    const isFull = () => limit !== undefined && kept.length >= limit;
    let next = 0;
    while (next < chunks.length && !isFull()) {
      const roundSize =
        limit === undefined
          ? chunks.length
          : next === 0
            ? Math.min(FETCH_CONCURRENCY, Math.ceil(limit / MAX_BATCH_FETCH))
            : FETCH_CONCURRENCY;
      const round = chunks.slice(next, next + roundSize);
      next += round.length;
      const fetched = new Array<AzureWorkItem[]>(round.length);
      await runWithConcurrency(round, FETCH_CONCURRENCY, async (chunk, index) => {
        fetched[index] = await this.getWorkItemBatch(chunk);
      });
      await prepare?.(fetched.flat());
      round.forEach((chunk, index) => {
        // Keep the query's order regardless of the batch fetch's ordering.
        const byId = new Map((fetched[index] ?? []).map((item) => [item.id, item]));
        for (const id of chunk) {
          const item = byId.get(id);
          if (item && (!keep || keep(item))) kept.push(item);
        }
      });
    }
    return limit === undefined ? kept : kept.slice(0, limit);
  }

  /**
   * One batch fetch of at most 200 Work Items. Relations brings the fields and the child links the
   * filters need; the web link `_links` would add is built locally (see convertWorkItem). Children
   * need only their fields.
   */
  private async getWorkItemBatch(ids: number[], expand = WorkItemExpand.Relations): Promise<AzureWorkItem[]> {
    const workItems = await this.witApi.getWorkItems(
      ids,
      undefined,
      undefined,
      expand,
      undefined,
      this.config.project,
    );
    return (workItems ?? []).filter((wi) => wi !== null) as AzureWorkItem[];
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

/** WIQL `$top` for a query whose results aren't filtered after fetching: no more IDs than the limit. */
function queryTop(filter: FilterCriteria): number | undefined {
  return filter.limit && !filter.excludeIfHasTasks ? filter.limit : undefined;
}
