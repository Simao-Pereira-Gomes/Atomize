import { hasStorySearch } from "../platforms/capabilities";
import type { IPlatformAdapter } from "../platforms/interfaces/platform.interface";
import type { StorySearch } from "../platforms/interfaces/story-search.interface";
import type { WorkItem } from "../platforms/interfaces/work-item.interface";
import { ConfigurationError } from "../utils/errors";

/** How many Stories a Story Browser lists at once, and adds per "Load more". */
export const STORY_SEARCH_LIMIT = 50;
/** The most Stories a Story Browser will list, however many times "Load more" is used. */
export const STORY_SEARCH_MAX = 500;

/** What a Story Browser shows for each Story. */
export interface StorySummary {
  id: string;
  title: string;
  type: string;
  state: string;
  taskCount: number;
  areaPath?: string;
  iteration?: string;
  createdDate?: Date;
}

/** Story Search mode: Stories matching free text and filters, independent of any Template. */
export async function searchStories(
  platform: IPlatformAdapter,
  search: Omit<StorySearch, "limit"> & { limit?: number },
): Promise<StorySummary[]> {
  if (!hasStorySearch(platform)) {
    throw new ConfigurationError("The selected platform cannot search Stories.");
  }
  // Without a chosen type, Tasks would crowd out the Stories a user is looking for.
  const excludeWorkItemTypes = search.workItemTypes?.length
    ? search.excludeWorkItemTypes
    : [...(search.excludeWorkItemTypes ?? []), platform.getEstimationDefaults().taskWorkItemType];
  const stories = await platform.searchStories({
    ...search,
    excludeWorkItemTypes,
    limit: Math.min(search.limit ?? STORY_SEARCH_LIMIT, STORY_SEARCH_MAX),
  });
  return stories.map(toStorySummary);
}

/**
 * The Story Browser's default view for generation: Stories of the given types in the team's
 * current or next sprint that have no Tasks yet and aren't closed, newest first.
 */
export async function listSprintStories(
  platform: IPlatformAdapter,
  options: { workItemTypes?: string[]; limit?: number } = {},
): Promise<StorySummary[]> {
  return searchStories(platform, {
    ...(options.workItemTypes?.length ? { workItemTypes: options.workItemTypes } : {}),
    currentAndNextSprint: true,
    excludeClosed: true,
    hasTasks: false,
    ...(options.limit ? { limit: options.limit } : {}),
  });
}

export function toStorySummary(item: WorkItem): StorySummary {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    state: item.state,
    taskCount: item.childCount ?? item.children?.length ?? 0,
    ...(item.areaPath ? { areaPath: item.areaPath } : {}),
    ...(item.iteration ? { iteration: item.iteration } : {}),
    ...(item.createdDate ? { createdDate: item.createdDate } : {}),
  };
}
