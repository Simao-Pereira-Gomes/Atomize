import { beforeEach, describe, expect, test } from "bun:test";
import { buildStorySearchWiql } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/work-item-query";
import { AzureDevOpsWorkItemRetrieval } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/work-item-retrieval";
import { MockPlatformAdapter } from "@sppg2001/atomize-core/platforms/adapters/mock/mock.adapter";
import {
  listAllStories,
  listSprintStories,
  STORY_LIST_MAX,
  STORY_SEARCH_LIMIT,
  STORY_SEARCH_MAX,
  searchStories,
} from "@sppg2001/atomize-core/services/story-search";
import { ConfigurationError } from "@sppg2001/atomize-core/utils/errors";

describe("buildStorySearchWiql", () => {
  test("matches free text against the title, newest first", () => {
    const wiql = buildStorySearchWiql({ text: "export", limit: 50 }, "MyProject");
    expect(wiql).toContain("[System.TeamProject] = 'MyProject'");
    expect(wiql).toContain("[System.Title] CONTAINS 'export'");
    expect(wiql).not.toContain("[System.Id] =");
    expect(wiql).toEndWith("ORDER BY [System.CreatedDate] DESC");
  });

  test("matches numeric text against the ID exactly or the title", () => {
    const wiql = buildStorySearchWiql({ text: " 1234 ", limit: 50 }, "MyProject");
    expect(wiql).toContain("([System.Id] = 1234 OR [System.Title] CONTAINS '1234')");
  });

  test("escapes quotes in free text", () => {
    const wiql = buildStorySearchWiql({ text: "user's profile", limit: 50 }, "MyProject");
    expect(wiql).toContain("[System.Title] CONTAINS 'user''s profile'");
  });

  test("ignores blank text", () => {
    const wiql = buildStorySearchWiql({ text: "   ", limit: 50 }, "MyProject");
    expect(wiql).not.toContain("[System.Title]");
  });

  test("narrows by type, state, and excluded types", () => {
    const wiql = buildStorySearchWiql(
      { workItemTypes: ["User Story", "Bug"], states: ["Active"], excludeWorkItemTypes: ["Task"], limit: 50 },
      "MyProject",
    );
    expect(wiql).toContain("[System.WorkItemType] IN ('User Story', 'Bug')");
    expect(wiql).toContain("[System.State] IN ('Active')");
    expect(wiql).toContain("[System.WorkItemType] NOT IN ('Task')");
  });

  test("limits to the team's current and next sprint and leaves out given states", () => {
    const wiql = buildStorySearchWiql({ currentAndNextSprint: true, excludeStates: ["Closed", "Removed"], limit: 50 }, "MyProject");
    expect(wiql).toContain("([System.IterationPath] = @CurrentIteration OR [System.IterationPath] = @CurrentIteration + 1)");
    expect(wiql).toContain("[System.State] NOT IN ('Closed', 'Removed')");
  });

  test("includes descendants of each area path and iteration", () => {
    const wiql = buildStorySearchWiql(
      { areaPaths: ["MyProject\\Backend", "MyProject\\Web"], iterations: ["MyProject\\Sprint 1"], limit: 50 },
      "MyProject",
    );
    expect(wiql).toContain("([System.AreaPath] UNDER 'MyProject\\Backend' OR [System.AreaPath] UNDER 'MyProject\\Web')");
    expect(wiql).toContain("[System.IterationPath] UNDER 'MyProject\\Sprint 1'");
  });
});

describe("searchStories", () => {
  let adapter: MockPlatformAdapter;

  beforeEach(async () => {
    adapter = new MockPlatformAdapter();
    await adapter.authenticate();
  });

  test("matches a title substring case-insensitively and summarises each Story", async () => {
    const stories = await searchStories(adapter, { text: "EXPORT" });
    expect(stories).toEqual([
      expect.objectContaining({ id: "STORY-007", title: "Implement data export feature", type: "User Story", state: "Active", taskCount: 1 }),
    ]);
  });

  test("matches an exact ID", async () => {
    const stories = await searchStories(adapter, { text: "story-003" });
    expect(stories.map((story) => story.id)).toEqual(["STORY-003"]);
  });

  test("orders Stories newest first", async () => {
    const stories = await searchStories(adapter, {});
    const dates = stories.map((story) => story.createdDate?.getTime() ?? 0);
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(stories[0]?.id).toBe("STORY-006");
  });

  test("narrows by state, area path including descendants, and iteration", async () => {
    expect((await searchStories(adapter, { states: ["Active"] })).map((story) => story.id).sort())
      .toEqual(["STORY-002", "STORY-007"]);
    expect((await searchStories(adapter, { areaPaths: ["MyProject\\Frontend"] })).map((story) => story.id).sort())
      .toEqual(["STORY-002", "STORY-006"]);
    expect((await searchStories(adapter, { areaPaths: ["MyProject"] })).length).toBe(7);
    expect((await searchStories(adapter, { iterations: ["Sprint 24"] })).map((story) => story.id).sort())
      .toEqual(["STORY-003", "STORY-005", "STORY-006"]);
  });

  test("keeps only Stories that already have Tasks when asked", async () => {
    const stories = await searchStories(adapter, { hasTasks: true });
    expect(stories.map((story) => story.id)).toEqual(["STORY-007"]);
  });

  test("caps the results", async () => {
    expect(await searchStories(adapter, { limit: 2 })).toHaveLength(2);
    expect(STORY_SEARCH_LIMIT).toBe(100);
  });

  test("lists every matching Story up to the list ceiling, past Story Search's maximum", async () => {
    let asked = 0;
    const platform = Object.assign(Object.create(adapter), {
      searchStories: async (search: { limit: number }) => {
        asked = search.limit;
        return adapter.searchStories(search as never);
      },
    });
    expect(await listAllStories(platform, { hasTasks: true })).toHaveLength(1);
    expect(asked).toBe(STORY_LIST_MAX);
    expect(STORY_LIST_MAX).toBeGreaterThan(STORY_SEARCH_MAX);
  });
});

describe("listSprintStories", () => {
  let adapter: MockPlatformAdapter;

  beforeEach(async () => {
    adapter = new MockPlatformAdapter();
    await adapter.authenticate();
  });

  test("lists open Stories of the given types in the current and next sprint that have no Tasks yet, newest first", async () => {
    const stories = await listSprintStories(adapter, { workItemTypes: ["User Story"] });
    expect(stories.map((story) => story.id)).toEqual(["STORY-006", "STORY-005", "STORY-003", "STORY-001", "STORY-002", "STORY-004"]);
    expect(stories.every((story) => story.taskCount === 0)).toBe(true);
  });

  test("lists no Stories of a type the sprint doesn't contain", async () => {
    expect(await listSprintStories(adapter, { workItemTypes: ["Bug"] })).toEqual([]);
  });

  test("caps the results, and never beyond the Story Browser maximum", async () => {
    expect(await listSprintStories(adapter, { limit: 2 })).toHaveLength(2);
    expect(STORY_SEARCH_MAX).toBe(500);
  });
});

describe("AzureDevOpsWorkItemRetrieval.search", () => {
  const item = (id: number, children: number) => ({
    id,
    fields: { "System.Title": `Story ${id}`, "System.WorkItemType": "User Story", "System.State": "Active" },
    relations: Array.from({ length: children }, (_, index) => ({ rel: "System.LinkTypes.Hierarchy-Forward", url: `https://x/_apis/wit/workItems/${id * 100 + index}` })),
  });

  function stubApi(ids: number[], items: ReturnType<typeof item>[]) {
    const calls: { top?: number; fetched?: number[] } = {};
    const api = {
      queryByWiql: async (_wiql: unknown, _team: unknown, _precision: unknown, top?: number) => {
        calls.top = top;
        return { workItems: ids.map((id) => ({ id })) };
      },
      // Deliberately returns items out of order, as a batch fetch may.
      getWorkItems: async (requested: number[]) => {
        calls.fetched = requested;
        return [...items].reverse();
      },
    };
    return { api, calls };
  }

  test("keeps the newest-first query order and reports each Story's Task count", async () => {
    const { api, calls } = stubApi([3, 2, 1], [item(3, 2), item(2, 0), item(1, 1)]);
    const stories = await new AzureDevOpsWorkItemRetrieval(api as never, { project: "P", team: "T" }).search({ limit: 50 });
    expect(stories.map((story) => [story.id, story.childCount])).toEqual([["3", 2], ["2", 0], ["1", 1]]);
    expect(calls.top).toBe(50);
  });

  test("over-fetches candidates when keeping only Stories with Tasks, then caps", async () => {
    const { api, calls } = stubApi([4, 3, 2, 1], [item(4, 0), item(3, 1), item(2, 0), item(1, 3)]);
    const stories = await new AzureDevOpsWorkItemRetrieval(api as never, { project: "P", team: "T" }).search({ limit: 1, hasTasks: true });
    expect(calls.top).toBe(5000);
    expect(stories.map((story) => story.id)).toEqual(["3"]);
  });

  test("still fills the page when Stories with Tasks are few and far back", async () => {
    // 1000 candidates, only every 100th has Tasks: a 4x over-fetch would have found none of a page of 5.
    const ids = Array.from({ length: 1000 }, (_, index) => 1000 - index);
    const api = {
      queryByWiql: async () => ({ workItems: ids.map((id) => ({ id })) }),
      getWorkItems: async (requested: number[]) => requested.map((id) => item(id, id % 100 === 0 ? 1 : 0)),
    };
    const stories = await new AzureDevOpsWorkItemRetrieval(api as never, { project: "P", team: "T" }).search({ limit: 5, hasTasks: true });
    expect(stories.map((story) => story.id)).toEqual(["1000", "900", "800", "700", "600"]);
  });

  test("keeps only Stories without Tasks when asked", async () => {
    const { api } = stubApi([3, 2, 1], [item(3, 2), item(2, 0), item(1, 1)]);
    const stories = await new AzureDevOpsWorkItemRetrieval(api as never, { project: "P", team: "T" }).search({ limit: 50, hasTasks: false });
    expect(stories.map((story) => story.id)).toEqual(["2"]);
  });

  test("fetches Work Items in batches of at most 200", async () => {
    const ids = Array.from({ length: 450 }, (_, index) => 450 - index);
    const batches: number[] = [];
    const api = {
      queryByWiql: async () => ({ workItems: ids.map((id) => ({ id })) }),
      getWorkItems: async (requested: number[]) => {
        batches.push(requested.length);
        return requested.map((id) => item(id, 0));
      },
    };
    const stories = await new AzureDevOpsWorkItemRetrieval(api as never, { project: "P", team: "T" }).search({ limit: 450 });
    expect(batches).toEqual([200, 200, 50]);
    expect(stories).toHaveLength(450);
    expect(stories[0]?.id).toBe("450");
  });

  test("stops fetching once the page is full", async () => {
    const ids = Array.from({ length: 400 }, (_, index) => 400 - index);
    const batches: number[] = [];
    const api = {
      queryByWiql: async () => ({ workItems: ids.map((id) => ({ id })) }),
      getWorkItems: async (requested: number[]) => {
        batches.push(requested.length);
        return requested.map((id) => item(id, 0));
      },
    };
    await new AzureDevOpsWorkItemRetrieval(api as never, { project: "P", team: "T" }).search({ limit: 50, hasTasks: false });
    expect(batches).toEqual([200]);
  });

  test("requires a team to list the current and next sprint", async () => {
    const { api } = stubApi([], []);
    await expect(new AzureDevOpsWorkItemRetrieval(api as never, { project: "P", team: "" }).search({ limit: 50, currentAndNextSprint: true }))
      .rejects.toBeInstanceOf(ConfigurationError);
  });
});
