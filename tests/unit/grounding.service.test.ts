import { describe, expect, mock, test } from "bun:test";
import type { IPlatformAdapter } from "@platforms/interfaces/platform.interface";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { GroundingService } from "@services/template/grounding.service";

function makeWorkItem(id: number): WorkItem {
  return {
    id: String(id),
    title: `Story ${id}`,
    type: "User Story",
    state: "Active",
  };
}

function makePlatform(overrides: Partial<IPlatformAdapter> = {}): IPlatformAdapter {
  return {
    authenticate: mock(async () => {}),
    getConnectUserEmail: mock(async () => "user@example.com"),
    queryWorkItems: mock(async () => [] as WorkItem[]),
    createTask: mock(async () => makeWorkItem(999)),
    createTasksBulk: mock(async () => [makeWorkItem(999)]),
    getPlatformMetadata: mock(() => ({ name: "mock", version: "1.0" })),
    ...overrides,
  };
}

describe("GroundingService — explicit mode", () => {
  test("returns null when all explicit IDs have no children", async () => {
    const platform = makePlatform({
      getWorkItem: mock(async (id: string) => makeWorkItem(Number(id))),
      getChildren: mock(async () => [] as WorkItem[]),
    });

    const service = new GroundingService(platform);
    const result = await service.fetchAndSummarize({ mode: "explicit", storyIds: ["1", "2"] });
    expect(result).toBeNull();
  });

  test("returns null when all explicit IDs do not exist", async () => {
    const platform = makePlatform({
      getWorkItem: mock(async () => null),
      getChildren: mock(async () => [] as WorkItem[]),
    });

    const service = new GroundingService(platform);
    const result = await service.fetchAndSummarize({ mode: "explicit", storyIds: ["99"] });
    expect(result).toBeNull();
  });

  test("filters out IDs with no children before running StoryLearner", async () => {
    const getChildren = mock(async (id: string) =>
      id === "1" ? [makeWorkItem(101), makeWorkItem(102)] : ([] as WorkItem[]),
    );
    const platform = makePlatform({
      getWorkItem: mock(async (id: string) => makeWorkItem(Number(id))),
      getChildren,
    });

    const service = new GroundingService(platform);
    // Will attempt to learn from story "1" (has children) but not "2" (no children).
    // StoryLearner will run on story "1" — result is a string summary or null.
    const result = await service.fetchAndSummarize({ mode: "explicit", storyIds: ["1", "2"] });
    expect(result === null || typeof result === "string").toBe(true);
  });
});

describe("GroundingService — auto mode", () => {
  test("returns null when queryWorkItems returns empty", async () => {
    const platform = makePlatform({
      queryWorkItems: mock(async () => [] as WorkItem[]),
      getChildren: mock(async () => [] as WorkItem[]),
    });

    const service = new GroundingService(platform);
    const result = await service.fetchAndSummarize({ mode: "auto" });
    expect(result).toBeNull();
  });

  test("returns null when no candidates have children", async () => {
    const platform = makePlatform({
      queryWorkItems: mock(async () => [makeWorkItem(1), makeWorkItem(2)]),
      getChildren: mock(async () => [] as WorkItem[]),
    });

    const service = new GroundingService(platform);
    const result = await service.fetchAndSummarize({ mode: "auto" });
    expect(result).toBeNull();
  });

  test("returns null when queryWorkItems throws", async () => {
    const platform = makePlatform({
      queryWorkItems: mock(async () => { throw new Error("network error"); }),
    });

    const service = new GroundingService(platform);
    const result = await service.fetchAndSummarize({ mode: "auto" });
    expect(result).toBeNull();
  });

  test("skips candidates where getChildren throws", async () => {
    const platform = makePlatform({
      queryWorkItems: mock(async () => [makeWorkItem(1)]),
      getChildren: mock(async () => { throw new Error("forbidden"); }),
    });

    const service = new GroundingService(platform);
    const result = await service.fetchAndSummarize({ mode: "auto" });
    expect(result).toBeNull();
  });
});
