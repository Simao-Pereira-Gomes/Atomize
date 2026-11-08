import { describe, expect, test } from "bun:test";
import type { AtomizationOptions, ProgressEvent } from "@sppg2001/atomize-core/core/atomizer";
import { StoryBatchProcessor } from "@sppg2001/atomize-core/core/story-batch-processor";
import type { StoryProcessor } from "@sppg2001/atomize-core/core/story-processor";
import type { WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const story = (id: string): WorkItem => ({ id, title: `Story ${id}`, type: "User Story", state: "New" });

function fakeProcessor(durations: Record<string, number>, events: string[], failing = new Set<string>()): StoryProcessor {
  return {
    process: async (s: WorkItem) => {
      events.push(`start ${s.id}`);
      await sleep(durations[s.id] ?? 0);
      events.push(`end ${s.id}`);
      if (failing.has(s.id)) throw new Error(`failed ${s.id}`);
      return { story: s, tasksCalculated: [], tasksCreated: [], success: true };
    },
  } as unknown as StoryProcessor;
}

function run(stories: WorkItem[], processor: StoryProcessor, options: AtomizationOptions, concurrency = 2) {
  return new StoryBatchProcessor().process({
    stories,
    orderedTasks: [],
    template: {} as TaskTemplate,
    connectUserEmail: "",
    options,
    warnings: [],
    concurrency,
    storyProcessor: processor,
  });
}

describe("StoryBatchProcessor", () => {
  test("starts the next Story as soon as one finishes, without waiting for the slowest", async () => {
    const events: string[] = [];
    await run([story("1"), story("2"), story("3")], fakeProcessor({ "1": 60, "2": 5, "3": 5 }, events), {});

    expect(events.indexOf("start 3")).toBeLessThan(events.indexOf("end 1"));
  });

  test("keeps results in Story order and emits progress events", async () => {
    const events: string[] = [];
    const progress: ProgressEvent[] = [];
    const { results } = await run(
      [story("1"), story("2"), story("3")],
      fakeProcessor({ "1": 30, "2": 5, "3": 5 }, events),
      { onProgress: (event) => progress.push(event) },
    );

    expect(results.map((r) => r.story.id)).toEqual(["1", "2", "3"]);
    expect(progress.filter((e) => e.type === "story_start")).toHaveLength(3);
    const completes = progress.filter((e) => e.type === "story_complete");
    expect(completes.map((e) => (e as { completedStories: number }).completedStories)).toEqual([1, 2, 3]);
  });

  test("stops starting Stories after the first error when continueOnError is false", async () => {
    const events: string[] = [];
    const { results, errors } = await run(
      [story("1"), story("2"), story("3"), story("4")],
      fakeProcessor({ "1": 5, "2": 30 }, events, new Set(["1"])),
      { continueOnError: false },
    );

    expect(events).not.toContain("start 3");
    expect(errors.map((e) => e.storyId)).toEqual(["1"]);
    expect(results.map((r) => [r.story.id, r.success])).toEqual([["1", false], ["2", true]]);
  });

  test("keeps going after an error when continueOnError is true", async () => {
    const events: string[] = [];
    const { results } = await run(
      [story("1"), story("2"), story("3")],
      fakeProcessor({}, events, new Set(["1"])),
      { continueOnError: true },
    );
    expect(results).toHaveLength(3);
  });

  test("stops starting Stories once the signal is aborted", async () => {
    const events: string[] = [];
    const controller = new AbortController();
    const processor = fakeProcessor({ "1": 5, "2": 30 }, events);
    const wrapped = {
      process: async (...args: Parameters<StoryProcessor["process"]>) => {
        const result = await processor.process(...args);
        if (args[0].id === "1") controller.abort();
        return result;
      },
    } as unknown as StoryProcessor;

    const { results } = await run([story("1"), story("2"), story("3")], wrapped, { signal: controller.signal });

    expect(events).not.toContain("start 3");
    expect(results.map((r) => r.story.id)).toEqual(["1", "2"]);
  });
});
