import { FilterEngine } from "../../core/filter-engine";
import type { IPlatformAdapter } from "../../platforms/interfaces/platform.interface";
import type { WorkItem } from "../../platforms/interfaces/work-item.interface";
import type { FilterCriteria as TemplateFilter } from "../../templates/schema";
import { type StorySummary, toStorySummary } from "../story-search";
import { type ProjectGroundingErrorCode, toProjectGroundingError } from "./project-grounding";

/** How many Stories the Template was applied to are offered for Story Grounding. */
export const STORY_GROUNDING_CANDIDATES = 30;
/** Each piece of Sensitive AI Context is cut to this length, so one long description can't crowd the prompt. */
const MAX_SENSITIVE_TEXT = 1000;

// Azure DevOps field reference names; other platforms can add theirs when their adapters arrive.
const ACCEPTANCE_CRITERIA_FIELD = "Microsoft.VSTS.Common.AcceptanceCriteria";
const ACTIVITY_FIELD = "Microsoft.VSTS.Common.Activity";

export interface StoryGroundingTask {
  title: string;
  state: string;
  estimate?: number | string;
  activity?: string;
  description?: string;
}

export interface StoryGroundingStory {
  id: string;
  title: string;
  type: string;
  state: string;
  estimate?: number | string;
  tasks: StoryGroundingTask[];
  description?: string;
  acceptanceCriteria?: string;
}

/**
 * Story Grounding (see CONTEXT.md): Stories the user chose and the Tasks they ended up with, so an
 * improvement reflects how the Template is really used. Sensitive AI Context only when opted in.
 */
export interface StoryGrounding {
  stories: StoryGroundingStory[];
  includesSensitiveContext: boolean;
}

export type StoryGroundingErrorCode = ProjectGroundingErrorCode | "GROUNDING_STORIES_UNUSABLE";

export class StoryGroundingError extends Error {
  constructor(readonly code: StoryGroundingErrorCode, message: string) {
    super(message);
    this.name = "StoryGroundingError";
  }
}

/**
 * The Stories a Template has been applied to: what its filter matches, with `excludeIfHasTasks`
 * turned off (it would hide exactly these), keeping only Stories that already have Tasks.
 */
export async function listAppliedStories(
  platform: IPlatformAdapter,
  templateFilter: TemplateFilter,
  options: { limit?: number } = {},
): Promise<StorySummary[]> {
  try {
    const userEmail = await platform.getConnectUserEmail();
    const filter = { ...new FilterEngine().convertFilter(templateFilter, userEmail), excludeIfHasTasks: false };
    const stories = await platform.queryWorkItems(filter);
    return stories
      .map(toStorySummary)
      .filter((story) => story.taskCount > 0)
      .sort((a, b) => (b.createdDate?.getTime() ?? 0) - (a.createdDate?.getTime() ?? 0))
      .slice(0, options.limit ?? STORY_GROUNDING_CANDIDATES);
  } catch (error) {
    throw toStoryGroundingError(error);
  }
}

/** Reads Story Grounding for the chosen Stories, failing with the reason any of them can't be used. */
export async function fetchStoryGrounding(
  platform: IPlatformAdapter,
  storyIds: string[],
  options: { includeSensitive?: boolean } = {},
): Promise<StoryGrounding> {
  if (storyIds.length === 0) {
    throw new StoryGroundingError("GROUNDING_STORIES_UNUSABLE", "Choose at least one Story to ground the improvement in.");
  }
  const includeSensitive = options.includeSensitive === true;
  try {
    if (!platform.getWorkItem || !platform.getChildren) {
      throw new StoryGroundingError("GROUNDING_FETCH_FAILED", "This platform can't read Stories and their Tasks.");
    }
    const getWorkItem = platform.getWorkItem.bind(platform);
    const getChildren = platform.getChildren.bind(platform);
    const taskEstimateFields = platform.getEstimationDefaults().taskEstimateFields;

    const problems: string[] = [];
    const stories: StoryGroundingStory[] = [];
    for (const id of storyIds) {
      const [item, children] = await Promise.all([getWorkItem(id), getChildren(id)]);
      if (!item) problems.push(`Story ${id} wasn't found`);
      else if (children.length === 0) problems.push(`Story ${id} has no Tasks`);
      else stories.push(toGroundingStory(item, children, taskEstimateFields, includeSensitive));
    }
    if (problems.length > 0) {
      throw new StoryGroundingError("GROUNDING_STORIES_UNUSABLE", `${problems.join("; ")}. Choose Stories the Template has already been applied to.`);
    }
    return { stories, includesSensitiveContext: includeSensitive };
  } catch (error) {
    throw toStoryGroundingError(error);
  }
}

function toGroundingStory(item: WorkItem, children: WorkItem[], taskEstimateFields: readonly string[], includeSensitive: boolean): StoryGroundingStory {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    state: item.state,
    ...(item.estimation !== undefined ? { estimate: item.estimation } : {}),
    tasks: children.map((child) => {
      const estimate = taskEstimateFields.map((field) => child.customFields?.[field]).find((value) => value !== undefined && value !== null && value !== "");
      const activity = child.customFields?.[ACTIVITY_FIELD];
      const description = includeSensitive ? plainText(child.description) : undefined;
      return {
        title: child.title,
        state: child.state,
        ...(estimate !== undefined ? { estimate } : {}),
        ...(typeof activity === "string" && activity ? { activity } : {}),
        ...(description ? { description } : {}),
      };
    }),
    ...(includeSensitive && plainText(item.description) ? { description: plainText(item.description) } : {}),
    ...(includeSensitive && plainText(item.customFields?.[ACCEPTANCE_CRITERIA_FIELD])
      ? { acceptanceCriteria: plainText(item.customFields?.[ACCEPTANCE_CRITERIA_FIELD]) }
      : {}),
  };
}

/** Rich-text fields arrive as HTML; the model needs only their words. */
function plainText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, MAX_SENSITIVE_TEXT) : undefined;
}

export function toStoryGroundingError(error: unknown): StoryGroundingError {
  if (error instanceof StoryGroundingError) return error;
  const { code, message } = toProjectGroundingError(error);
  return new StoryGroundingError(
    code,
    code === "GROUNDING_FETCH_FAILED" ? message.replace("project metadata", "Stories") : message,
  );
}

/** The most Story Grounding a prompt carries, so many Stories or long Task lists can't exceed a model's limit. */
export const STORY_GROUNDING_PROMPT_LIMIT = 16_000;
const MAX_TASKS_PER_STORY = 25;

/**
 * Story Grounding as the prompt carries it: Tasks per Story capped, then Stories left out from the
 * end until it fits. `included` says how many Stories made it in.
 */
export function storyGroundingForPrompt(grounding: StoryGrounding, limit = STORY_GROUNDING_PROMPT_LIMIT): { text: string; included: number; trimmed: boolean } {
  let trimmed = false;
  const stories = grounding.stories.map((story) => {
    if (story.tasks.length <= MAX_TASKS_PER_STORY) return story;
    trimmed = true;
    return { ...story, tasks: story.tasks.slice(0, MAX_TASKS_PER_STORY) };
  });
  while (stories.length > 0) {
    const text = JSON.stringify(stories);
    if (text.length <= limit) return { text, included: stories.length, trimmed };
    stories.pop();
    trimmed = true;
  }
  return { text: "[]", included: 0, trimmed: true };
}
