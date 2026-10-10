import { describe, expect, test } from "bun:test";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import type { WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import {
  fetchStoryGrounding,
  listAppliedStories,
  STORY_GROUNDING_CANDIDATES,
  STORY_GROUNDING_PROMPT_LIMIT,
  StoryGroundingError,
  storyGroundingForPrompt,
} from "@sppg2001/atomize-core/services/template/story-grounding";
import { AuthError } from "@sppg2001/atomize-core/utils/errors";

function story(id: string, created: string, children: WorkItem[], extra: Partial<WorkItem> = {}): WorkItem {
  return {
    id,
    title: `Story ${id}`,
    type: "User Story",
    state: "Active",
    estimation: 5,
    createdDate: new Date(created),
    childCount: children.length,
    description: `<p>Customer <b>Acme</b> needs ${id}</p>`,
    customFields: { "Microsoft.VSTS.Common.AcceptanceCriteria": "<ul><li>Works for Acme</li></ul>" },
    ...extra,
  };
}

function task(id: string, title: string, hours: number, description = "Secret internal URL"): WorkItem {
  return {
    id,
    title,
    type: "Task",
    state: "Done",
    description,
    customFields: { "Microsoft.VSTS.Scheduling.OriginalEstimate": hours, "Microsoft.VSTS.Common.Activity": "Development" },
  };
}

const CHILDREN: Record<string, WorkItem[]> = {
  "1": [task("11", "Build", 6), task("12", "Test", 2)],
  "2": [],
  "3": [task("31", "Build", 4)],
};

/** A platform whose Stories 1–3 exist, with 1 and 3 already broken into Tasks. */
function platform(overrides: Partial<Record<string, unknown>> = {}) {
  const filters: unknown[] = [];
  const stories = [story("1", "2024-01-02", CHILDREN["1"] ?? []), story("2", "2024-01-03", []), story("3", "2024-01-01", CHILDREN["3"] ?? [])];
  const adapter = {
    getConnectUserEmail: async () => "me@example.com",
    getEstimationDefaults: () => ({
      storyEstimateFields: ["Microsoft.VSTS.Scheduling.StoryPoints"],
      taskWorkItemType: "Task",
      taskEstimateFields: ["Microsoft.VSTS.Scheduling.OriginalEstimate"],
      unitLabel: "hours",
    }),
    queryWorkItems: async (filter: unknown) => {
      filters.push(filter);
      return stories;
    },
    getWorkItem: async (id: string) => stories.find((s) => s.id === id) ?? null,
    getChildren: async (id: string) => CHILDREN[id] ?? [],
    ...overrides,
  } as unknown as IPlatformAdapter;
  return { adapter, filters };
}

describe("listAppliedStories", () => {
  test("lists Stories the Template's filter matches that already have Tasks, newest first", async () => {
    const { adapter } = platform();
    const stories = await listAppliedStories(adapter, { workItemTypes: ["User Story"], excludeIfHasTasks: true });
    expect(stories.map((s) => [s.id, s.taskCount])).toEqual([["1", 2], ["3", 1]]);
  });

  test("ignores the Template's excludeIfHasTasks, which would hide exactly these Stories", async () => {
    const { adapter, filters } = platform();
    await listAppliedStories(adapter, { workItemTypes: ["User Story"], excludeIfHasTasks: true });
    expect(filters[0]).toMatchObject({ excludeIfHasTasks: false });
  });

  test("caps the list at 30", async () => {
    const many = Array.from({ length: 40 }, (_, i) => story(String(100 + i), `2024-02-${String((i % 28) + 1).padStart(2, "0")}`, [task("t", "T", 1)]));
    const { adapter } = platform({ queryWorkItems: async () => many });
    expect(await listAppliedStories(adapter, {})).toHaveLength(STORY_GROUNDING_CANDIDATES);
    expect(STORY_GROUNDING_CANDIDATES).toBe(30);
  });

  test("reports a platform failure as a typed error", async () => {
    const { adapter } = platform({ queryWorkItems: async () => { throw new AuthError("Authentication failed: access denied", "azure-devops"); } });
    const error = await listAppliedStories(adapter, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StoryGroundingError);
    expect((error as StoryGroundingError).code).toBe("GROUNDING_AUTH_FAILED");
  });
});

describe("fetchStoryGrounding", () => {
  test("gives each Story's title, estimate, and the Tasks it ended up with", async () => {
    const { adapter } = platform();
    const grounding = await fetchStoryGrounding(adapter, ["1", "3"]);

    expect(grounding.includesSensitiveContext).toBe(false);
    expect(grounding.stories).toEqual([
      { id: "1", title: "Story 1", type: "User Story", state: "Active", estimate: 5, tasks: [
        { title: "Build", state: "Done", estimate: 6, activity: "Development" },
        { title: "Test", state: "Done", estimate: 2, activity: "Development" },
      ] },
      { id: "3", title: "Story 3", type: "User Story", state: "Active", estimate: 5, tasks: [
        { title: "Build", state: "Done", estimate: 4, activity: "Development" },
      ] },
    ]);
  });

  test("leaves out descriptions and acceptance criteria unless Sensitive AI Context is included", async () => {
    const { adapter } = platform();
    const json = JSON.stringify(await fetchStoryGrounding(adapter, ["1"]));
    expect(json).not.toContain("Acme");
    expect(json).not.toContain("Secret internal URL");
  });

  test("includes descriptions and acceptance criteria as plain text when opted in", async () => {
    const { adapter } = platform();
    const grounding = await fetchStoryGrounding(adapter, ["1"], { includeSensitive: true });
    expect(grounding.includesSensitiveContext).toBe(true);
    expect(grounding.stories[0]).toMatchObject({ description: "Customer Acme needs 1", acceptanceCriteria: "Works for Acme" });
    expect(grounding.stories[0]?.tasks[0]).toMatchObject({ description: "Secret internal URL" });
  });

  test("throws, naming the Stories that can't be used, instead of quietly skipping them", async () => {
    const { adapter } = platform();
    const error = await fetchStoryGrounding(adapter, ["1", "2", "404"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StoryGroundingError);
    expect((error as StoryGroundingError).code).toBe("GROUNDING_STORIES_UNUSABLE");
    expect((error as Error).message).toContain("2 has no Tasks");
    expect((error as Error).message).toContain("404 wasn't found");
  });

  test("throws on an empty selection", async () => {
    const { adapter } = platform();
    await expect(fetchStoryGrounding(adapter, [])).rejects.toBeInstanceOf(StoryGroundingError);
  });

  test("reports a platform failure as a typed error", async () => {
    const { adapter } = platform({ getChildren: async () => { throw new Error("socket hang up"); } });
    const error = await fetchStoryGrounding(adapter, ["1"]).catch((e: unknown) => e);
    expect((error as StoryGroundingError).code).toBe("GROUNDING_FETCH_FAILED");
  });
});

describe("storyGroundingForPrompt", () => {
  const story = (id: string, tasks: number) => ({
    id, title: `Story ${id}`, type: "User Story", state: "Done",
    tasks: Array.from({ length: tasks }, (_, i) => ({ title: `Task ${i} with a reasonably descriptive title`, state: "Done", estimate: 4, activity: "Development" })),
  });

  test("keeps small Story Grounding whole", () => {
    const result = storyGroundingForPrompt({ stories: [story("1", 3)], includesSensitiveContext: false });
    expect(result).toMatchObject({ included: 1, trimmed: false });
    expect(JSON.parse(result.text)[0].tasks).toHaveLength(3);
  });

  test("caps Tasks per Story, then leaves Stories out from the end until it fits", () => {
    const result = storyGroundingForPrompt({ stories: Array.from({ length: 40 }, (_, i) => story(String(i), 60)), includesSensitiveContext: false });
    expect(result.text.length).toBeLessThanOrEqual(STORY_GROUNDING_PROMPT_LIMIT);
    expect(result.trimmed).toBe(true);
    expect(result.included).toBeGreaterThan(0);
    expect(result.included).toBeLessThan(40);
    expect(JSON.parse(result.text)[0].tasks).toHaveLength(25);
  });
});
