import { describe, expect, test } from "bun:test";
import { createJsonStreamProgressHandler } from "@/cli/orchestrator/atomize-orchestrator";
import type { WorkItem } from "@/platforms/interfaces/work-item.interface";

function makeStory(id: string, title = `Story ${id}`): WorkItem {
  return { id, title } as WorkItem;
}

function parseFirst(lines: string[]): unknown {
  expect(lines).toHaveLength(1);
  const [line] = lines;
  if (line === undefined) throw new Error("Expected one JSON stream line.");
  return JSON.parse(line);
}

describe("createJsonStreamProgressHandler — progress events", () => {
  test("story_start emits a progress envelope", () => {
    const lines: string[] = [];
    const handler = createJsonStreamProgressHandler((line) => lines.push(line));

    handler({ type: "story_start", storyIndex: 0, totalStories: 3, story: makeStory("US-1") });

    const parsed = parseFirst(lines) as { event: string; data: { type: string; story: { id: string } } };
    expect(parsed.event).toBe("progress");
    expect(parsed.data.type).toBe("story_start");
    expect(parsed.data.story.id).toBe("US-1");
  });

  test("story_complete emits a progress envelope", () => {
    const lines: string[] = [];
    const handler = createJsonStreamProgressHandler((line) => lines.push(line));

    handler({ type: "story_complete", completedStories: 1, totalStories: 2, story: makeStory("US-2", "Done") });

    const parsed = parseFirst(lines) as { event: string; data: { type: string; completedStories: number } };
    expect(parsed.event).toBe("progress");
    expect(parsed.data.type).toBe("story_complete");
    expect(parsed.data.completedStories).toBe(1);
  });

  test("story_error emits a progress envelope", () => {
    const lines: string[] = [];
    const handler = createJsonStreamProgressHandler((line) => lines.push(line));

    handler({ type: "story_error", completedStories: 1, totalStories: 2, story: makeStory("US-3"), error: "connection timeout" });

    const parsed = parseFirst(lines) as { event: string; data: { type: string; error: string } };
    expect(parsed.event).toBe("progress");
    expect(parsed.data.type).toBe("story_error");
    expect(parsed.data.error).toBe("connection timeout");
  });

  test("task_created emits a progress envelope", () => {
    const lines: string[] = [];
    const handler = createJsonStreamProgressHandler((line) => lines.push(line));

    handler({ type: "task_created", tasksCreated: 3, completedStories: 0, totalStories: 1 });

    const parsed = parseFirst(lines) as { event: string; data: { type: string; tasksCreated: number } };
    expect(parsed.event).toBe("progress");
    expect(parsed.data.type).toBe("task_created");
    expect(parsed.data.tasksCreated).toBe(3);
  });
});

describe("createJsonStreamProgressHandler — suppressed events", () => {
  test.each([
    "query_start",
    "query_complete",
    "dependency_created",
    "complete",
  ] as const)("%s produces no output", (eventType) => {
    const lines: string[] = [];
    const handler = createJsonStreamProgressHandler((line) => lines.push(line));

    handler({ type: eventType, totalStories: 2, tasksCreated: 1, dependenciesCreated: 0 });

    expect(lines).toHaveLength(0);
  });

  test("each emitted line is valid JSON", () => {
    const lines: string[] = [];
    const handler = createJsonStreamProgressHandler((line) => lines.push(line));

    handler({ type: "story_start", storyIndex: 0, totalStories: 1, story: makeStory("US-1") });
    handler({ type: "story_complete", completedStories: 1, totalStories: 1, story: makeStory("US-1") });

    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
