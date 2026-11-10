import { describe, expect, test } from "bun:test";
import { AzureDevOpsWorkItemRetrieval } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/work-item-retrieval";
import type { WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import { WorkItemExpand } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";

const item = (id: number, children = 0) => ({
  id,
  fields: { "System.Title": `Story ${id}`, "System.WorkItemType": "User Story", "System.State": "Active" },
  relations: Array.from({ length: children }, (_, index) => ({
    rel: "System.LinkTypes.Hierarchy-Forward",
    url: `https://x/_apis/wit/workItems/${id * 100 + index}`,
  })),
});

function stubApi(ids: number[], childrenOf: (id: number) => number = () => 0, delayMs = 0) {
  const batches: number[][] = [];
  const tops: Array<number | undefined> = [];
  let inFlight = 0;
  let peak = 0;
  const api = {
    queryByWiql: async (_wiql: unknown, _team: unknown, _precision?: unknown, top?: number) => {
      tops.push(top);
      return { workItems: ids.slice(0, top ?? ids.length).map((id) => ({ id })) };
    },
    getWorkItems: async (requested: number[]) => {
      batches.push(requested);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      inFlight--;
      return requested.map((id) => item(id, childrenOf(id)));
    },
  };
  return { api, batches, tops, peak: () => peak };
}

const range = (count: number) => Array.from({ length: count }, (_, index) => count - index);
const retrieval = (api: unknown) => new AzureDevOpsWorkItemRetrieval(api as never, { project: "P", team: "T" });

describe("AzureDevOpsWorkItemRetrieval.query with a limit", () => {
  test("fetches only up to the limit when nothing is filtered out after fetching", async () => {
    const { api, batches, tops } = stubApi(range(2000));

    const stories = await retrieval(api).query({ limit: 10 });

    expect(stories.map((s) => s.id)).toEqual(range(2000).slice(0, 10).map(String));
    expect(batches.map((b) => b.length)).toEqual([10]);
    expect(tops).toEqual([10]);
  });

  test("with excludeIfHasTasks, stops fetching once the limit is filled", async () => {
    // Every Story has no Tasks, so the first 200 fill a limit of 10.
    const { api, batches, tops } = stubApi(range(2000));

    const stories = await retrieval(api).query({ limit: 10, excludeIfHasTasks: true });

    expect(stories).toHaveLength(10);
    expect(batches.map((b) => b.length)).toEqual([200]);
    expect(tops).toEqual([undefined]);
  });

  test("with excludeIfHasTasks, keeps fetching until enough Stories without Tasks are found", async () => {
    // Only every 300th Story is free of Tasks.
    const { api } = stubApi(range(2000), (id) => (id % 300 === 0 ? 0 : 1));

    const stories = await retrieval(api).query({ limit: 3, excludeIfHasTasks: true });

    expect(stories.map((s) => s.id)).toEqual(["1800", "1500", "1200"]);
  });

  test("applies the limit to explicit Story IDs too", async () => {
    const { api, batches } = stubApi([]);

    const stories = await retrieval(api).query({ workItemIds: ["5", "6", "7"], limit: 2 });

    expect(stories.map((s) => s.id)).toEqual(["5", "6"]);
    expect(batches).toEqual([[5, 6]]);
  });
});

describe("AzureDevOpsWorkItemRetrieval.query without a limit", () => {
  test("fetches every match in 200-item chunks, a few at a time, keeping query order", async () => {
    const { api, batches, peak } = stubApi(range(1000), () => 0, 5);

    const stories = await retrieval(api).query({});

    expect(batches.map((b) => b.length)).toEqual([200, 200, 200, 200, 200]);
    expect(peak()).toBe(3);
    expect(stories.map((s) => s.id)).toEqual(range(1000).map(String));
  });
});

describe("AzureDevOpsWorkItemRetrieval Story fetch", () => {
  test("asks only for fields and relations, and still gives each Story a link", async () => {
    const expands: unknown[] = [];
    const api = {
      queryByWiql: async () => ({ workItems: [{ id: 42 }] }),
      getWorkItems: async (ids: number[], _fields: unknown, _asOf: unknown, expand: unknown) => {
        expands.push(expand);
        return ids.map((id) => ({ ...item(id), fields: { ...item(id).fields, "System.TeamProject": "P" } }));
      },
    };

    const [story] = await new AzureDevOpsWorkItemRetrieval(api as never, {
      project: "P",
      team: "T",
      organizationUrl: "https://dev.azure.com/org",
    }).query({});

    expect(expands).toEqual([WorkItemExpand.Relations]);
    expect(story?.url).toBe("https://dev.azure.com/org/P/_workitems/edit/42");
  });
});

/**
 * Stories 1..n by ID, whose children are listed in `childrenOf` as [id, title, type]. Child Work
 * Items are served by the same getWorkItems; `childFetches` records each request for children.
 */
function storiesWithChildren(childrenOf: Record<number, Array<[number, string, string]>>) {
  const children = new Map(Object.values(childrenOf).flat().map(([id, title, type]) => [id, { title, type }]));
  const storyFetches: number[][] = [];
  const childFetches: number[][] = [];
  const api = {
    getWorkItems: async (requested: number[]) => {
      if (requested.every((id) => children.has(id))) {
        childFetches.push(requested);
        return requested.map((id) => ({
          id,
          fields: { "System.Title": children.get(id)?.title, "System.WorkItemType": children.get(id)?.type, "System.State": "New" },
        }));
      }
      storyFetches.push(requested);
      return requested.map((id) => ({
        id,
        fields: { "System.Title": `Story ${id}`, "System.WorkItemType": "User Story", "System.State": "Active" },
        relations: (childrenOf[id] ?? []).map(([childId]) => ({
          rel: "System.LinkTypes.Hierarchy-Forward",
          url: `https://x/_apis/wit/workItems/${childId}`,
        })),
      }));
    },
  };
  return { api, storyFetches, childFetches };
}

describe("AzureDevOpsWorkItemRetrieval.query counting child Tasks by type", () => {
  const childrenOf: Record<number, Array<[number, string, string]>> = {
    1: [[101, "Login bug", "Bug"]],
    2: [[201, "Design", "Task"], [202, "Repro", "Bug"]],
    3: [],
  };

  test("with excludeIfHasTasks, keeps a Story whose only children aren't of the Task type", async () => {
    const { api } = storiesWithChildren(childrenOf);

    const stories = await retrieval(api).query({ workItemIds: ["1", "2", "3"], excludeIfHasTasks: true, taskWorkItemTypes: ["Task"] });

    expect(stories.map((s) => s.id)).toEqual(["1", "3"]);
  });

  test("hands each excluded Story to onExcluded with its child Tasks only", async () => {
    const { api } = storiesWithChildren(childrenOf);
    const excluded: WorkItem[] = [];

    await retrieval(api).query(
      { workItemIds: ["1", "2", "3"], excludeIfHasTasks: true, taskWorkItemTypes: ["Task"] },
      { onExcluded: (story) => excluded.push(story) },
    );

    expect(excluded.map((s) => [s.id, s.children?.map((c) => [c.id, c.title, c.type])])).toEqual([
      ["2", [["201", "Design", "Task"]]],
    ]);
  });

  test("with includeTaskChildren, fills in each Story's child Tasks and excludes nothing", async () => {
    const { api } = storiesWithChildren(childrenOf);

    const stories = await retrieval(api).query({ workItemIds: ["1", "2", "3"], includeTaskChildren: true, taskWorkItemTypes: ["Task"] });

    expect(stories.map((s) => [s.id, s.children?.map((c) => c.title)])).toEqual([
      ["1", []],
      ["2", ["Design"]],
      ["3", []],
    ]);
  });

  test("reads children only for Stories that have some, in one batch", async () => {
    const { api, childFetches } = storiesWithChildren(childrenOf);

    await retrieval(api).query({ workItemIds: ["1", "2", "3"], excludeIfHasTasks: true, taskWorkItemTypes: ["Task"] });

    expect(childFetches).toEqual([[101, 201, 202]]);
  });

  test("without Task types, counts every child as before and reads no children", async () => {
    const { api, childFetches } = storiesWithChildren(childrenOf);

    const stories = await retrieval(api).query({ workItemIds: ["1", "2", "3"], excludeIfHasTasks: true });

    expect(stories.map((s) => s.id)).toEqual(["3"]);
    expect(childFetches).toEqual([]);
  });

  test("with a limit, stops reading Stories once enough without Tasks are kept", async () => {
    const many: Record<number, Array<[number, string, string]>> = {};
    for (let id = 1; id <= 600; id++) many[id] = id % 2 === 0 ? [[10_000 + id, "Design", "Task"]] : [[10_000 + id, "Bug", "Bug"]];
    const { api, storyFetches } = storiesWithChildren(many);
    const ids = Array.from({ length: 600 }, (_, index) => String(index + 1));

    const stories = await retrieval(api).query({ workItemIds: ids, limit: 50, excludeIfHasTasks: true, taskWorkItemTypes: ["Task"] });

    expect(stories).toHaveLength(50);
    expect(storyFetches.map((b) => b.length)).toEqual([200]);
  });
});
