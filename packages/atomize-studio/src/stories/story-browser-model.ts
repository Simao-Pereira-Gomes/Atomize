/** One Story as the Story Browser lists it. */
export type StoryRow = { id: string; title: string; type: string; state: string; taskCount: number };

/** The Story Search narrowing a user has chosen in the Story Browser's Search mode. */
export type StoryFilters = {
  text: string;
  workItemTypes: string[];
  states: string[];
  areaPaths: string[];
  iterations: string[];
  hasTasks: boolean;
};

export const PAGE_SIZE = 100;
export const MAX_STORIES = 500;

export function emptyFilters(hasTasks: boolean): StoryFilters {
  return { text: "", workItemTypes: [], states: [], areaPaths: [], iterations: [], hasTasks };
}

/** The Story Search request for the sidecar: only the filters in effect, plus the page size so far. */
export function toSearchRequest(filters: StoryFilters, limit: number): Record<string, unknown> {
  return {
    ...(filters.text.trim() ? { text: filters.text.trim() } : {}),
    ...(filters.workItemTypes.length ? { workItemTypes: filters.workItemTypes } : {}),
    ...(filters.states.length ? { states: filters.states } : {}),
    ...(filters.areaPaths.length ? { areaPaths: filters.areaPaths } : {}),
    ...(filters.iterations.length ? { iterations: filters.iterations } : {}),
    ...(filters.hasTasks ? { hasTasks: true } : {}),
    limit,
  };
}

export function parseStoryRows(value: unknown): StoryRow[] {
  const stories = typeof value === "object" && value !== null ? (value as { stories?: unknown }).stories : undefined;
  if (!Array.isArray(stories)) return [];
  return stories.flatMap((story) => {
    if (typeof story !== "object" || story === null) return [];
    const row = story as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.title !== "string") return [];
    return [{
      id: row.id,
      title: row.title,
      type: typeof row.type === "string" ? row.type : "",
      state: typeof row.state === "string" ? row.state : "",
      taskCount: typeof row.taskCount === "number" ? row.taskCount : 0,
    }];
  });
}

/** Whether another page could exist: the last load filled its limit and the maximum isn't reached. */
export function canLoadMore(loaded: number, limit: number): boolean {
  return loaded >= limit && limit < MAX_STORIES;
}

/**
 * How much of the list is loaded, for the Story Browser's footer: how many Stories are showing (of
 * how many loaded, when typing narrows them), and whether more can load or the maximum is reached.
 */
export function loadedSummary(shown: number, loaded: number, state: { more: boolean; atMax: boolean }): string {
  if (loaded === 0) return "";
  const noun = (count: number) => (count === 1 ? "Story" : "Stories");
  const count = shown < loaded ? `Showing ${shown} of ${loaded} ${noun(loaded)} loaded` : `${loaded} ${noun(loaded)} loaded`;
  if (state.more) return `${count} · more available`;
  if (state.atMax) return `${count} · the newest ${MAX_STORIES}; narrow the search to reach older ones`;
  return `${count} · all loaded`;
}

export function describeRow(row: StoryRow): string {
  return [row.type, row.state, `${row.taskCount} ${row.taskCount === 1 ? "task" : "tasks"}`].filter(Boolean).join(" · ");
}
