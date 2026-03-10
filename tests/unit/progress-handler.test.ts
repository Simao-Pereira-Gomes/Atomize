import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ProgressEvent } from "@core/atomizer";
import { createProgressHandler } from "@/cli/commands/generate.command";
import type { WorkItem } from "@/platforms/interfaces/work-item.interface";

function makeStory(id: string, title = `Story ${id}`): WorkItem {
  return { id, title } as WorkItem;
}

function makeHandlerFixtures() {
  const querySpinner = { message: mock(), stop: mock() };
  const mockProgressBar = { start: mock(), advance: mock(), stop: mock() };
  const storyProgressRef: {
    current: typeof mockProgressBar | undefined;
  } = { current: undefined };
  const print = mock<(msg: string) => void>();
  const logSuccess = mock<(msg: string) => void>();
  const logError = mock<(msg: string) => void>();
  const makeProgress = mock(() => mockProgressBar);

  return {
    querySpinner,
    mockProgressBar,
    storyProgressRef,
    print,
    logSuccess,
    logError,
    makeProgress,
  };
}

describe("createProgressHandler — TTY mode", () => {
  let f: ReturnType<typeof makeHandlerFixtures>;
  let handler: (event: ProgressEvent) => void;

  beforeEach(() => {
    f = makeHandlerFixtures();
    handler = createProgressHandler(
      true,
      f.querySpinner,
      f.storyProgressRef,
      f.print,
      f.logSuccess,
      f.logError,
      f.makeProgress,
    );
  });

  test("query_start: updates the spinner message, does not print", () => {
    handler({ type: "query_start" });
    expect(f.querySpinner.message).toHaveBeenCalledWith(
      "Querying work items...",
    );
    expect(f.print).not.toHaveBeenCalled();
  });

  test("query_complete: stops spinner, creates and starts progress bar", () => {
    handler({ type: "query_complete", totalStories: 5 });

    expect(f.querySpinner.stop).toHaveBeenCalledWith("Found 5 stories");
    expect(f.makeProgress).toHaveBeenCalledWith(5);
    expect(f.mockProgressBar.start).toHaveBeenCalledWith(
      "Processing stories (0/5)",
    );
    expect(f.storyProgressRef.current).toBe(f.mockProgressBar);
    expect(f.print).not.toHaveBeenCalled();
  });

  test("query_complete: falls back to max=1 when totalStories is undefined", () => {
    handler({ type: "query_complete", totalStories: undefined });
    expect(f.makeProgress).toHaveBeenCalledWith(1);
  });

  test("story_start: does nothing in TTY mode (spinner handles state)", () => {
    handler({
      type: "story_start",
      storyIndex: 0,
      totalStories: 3,
      story: makeStory("US-1"),
    });
    expect(f.print).not.toHaveBeenCalled();
    expect(f.logSuccess).not.toHaveBeenCalled();
    expect(f.logError).not.toHaveBeenCalled();
  });

  test("story_complete: calls logSuccess and advances the progress bar", () => {
    f.storyProgressRef.current = f.mockProgressBar;

    handler({
      type: "story_complete",
      completedStories: 1,
      totalStories: 3,
      story: makeStory("US-1", "My Story"),
    });

    expect(f.logSuccess).toHaveBeenCalledWith("[1/3] US-1: My Story");
    expect(f.mockProgressBar.advance).toHaveBeenCalledWith(1, "1/3 stories");
    expect(f.print).not.toHaveBeenCalled();
  });

  test("story_complete: falls back to print when no progress bar exists yet", () => {
    handler({
      type: "story_complete",
      completedStories: 1,
      totalStories: 3,
      story: makeStory("US-1", "My Story"),
    });

    expect(f.print).toHaveBeenCalledWith("✓ [1/3] US-1: My Story");
    expect(f.logSuccess).not.toHaveBeenCalled();
  });

  test("story_error: calls logError and advances the progress bar", () => {
    f.storyProgressRef.current = f.mockProgressBar;

    handler({
      type: "story_error",
      completedStories: 2,
      totalStories: 3,
      story: makeStory("US-2"),
      error: "connection timeout",
    });

    expect(f.logError).toHaveBeenCalledWith("[2/3] US-2: connection timeout");
    expect(f.mockProgressBar.advance).toHaveBeenCalledWith(1, "2/3 stories");
    expect(f.print).not.toHaveBeenCalled();
  });

  test("story_error: falls back to print when no progress bar exists yet", () => {
    handler({
      type: "story_error",
      completedStories: 1,
      totalStories: 3,
      story: makeStory("US-1"),
      error: "not found",
    });

    expect(f.print).toHaveBeenCalledWith("✗ [1/3] US-1: not found");
    expect(f.logError).not.toHaveBeenCalled();
  });
});

describe("createProgressHandler — non-TTY mode", () => {
  let f: ReturnType<typeof makeHandlerFixtures>;
  let handler: (event: ProgressEvent) => void;

  beforeEach(() => {
    f = makeHandlerFixtures();
    handler = createProgressHandler(
      false,
      f.querySpinner,
      f.storyProgressRef,
      f.print,
      f.logSuccess,
      f.logError,
      f.makeProgress,
    );
  });

  test("query_start: does nothing (no spinner in non-TTY)", () => {
    handler({ type: "query_start" });
    expect(f.querySpinner.message).not.toHaveBeenCalled();
    expect(f.print).not.toHaveBeenCalled();
  });

  test("query_complete: prints story count, never touches spinner or progress bar", () => {
    handler({ type: "query_complete", totalStories: 7 });

    expect(f.print).toHaveBeenCalledWith("Found 7 stories");
    expect(f.querySpinner.stop).not.toHaveBeenCalled();
    expect(f.makeProgress).not.toHaveBeenCalled();
  });

  test("story_start: prints a numbered processing line", () => {
    handler({
      type: "story_start",
      storyIndex: 0,
      totalStories: 3,
      story: makeStory("US-1"),
    });

    expect(f.print).toHaveBeenCalledWith("Processing 1/3: US-1...");
  });

  test("story_start: treats undefined storyIndex as 0", () => {
    handler({
      type: "story_start",
      storyIndex: undefined,
      totalStories: 5,
      story: makeStory("US-1"),
    });

    expect(f.print).toHaveBeenCalledWith("Processing 1/5: US-1...");
  });

  test("story_complete: prints a ✓ line, never calls logSuccess", () => {
    handler({
      type: "story_complete",
      completedStories: 2,
      totalStories: 3,
      story: makeStory("US-2", "Story Two"),
    });

    expect(f.print).toHaveBeenCalledWith("✓ [2/3] US-2: Story Two");
    expect(f.logSuccess).not.toHaveBeenCalled();
    expect(f.mockProgressBar.advance).not.toHaveBeenCalled();
  });

  test("story_error: prints a ✗ line, never calls logError", () => {
    handler({
      type: "story_error",
      completedStories: 1,
      totalStories: 3,
      story: makeStory("US-1"),
      error: "access denied",
    });

    expect(f.print).toHaveBeenCalledWith("✗ [1/3] US-1: access denied");
    expect(f.logError).not.toHaveBeenCalled();
    expect(f.mockProgressBar.advance).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Event sequencing — progress bar state flows correctly across events
// ---------------------------------------------------------------------------
describe("createProgressHandler — event sequencing", () => {
  test("query_complete populates storyProgressRef so story_complete can use it", () => {
    const f = makeHandlerFixtures();
    const handler = createProgressHandler(
      true,
      f.querySpinner,
      f.storyProgressRef,
      f.print,
      f.logSuccess,
      f.logError,
      f.makeProgress,
    );

    handler({ type: "query_complete", totalStories: 2 });
    handler({
      type: "story_complete",
      completedStories: 1,
      totalStories: 2,
      story: makeStory("US-1", "First"),
    });
    handler({
      type: "story_complete",
      completedStories: 2,
      totalStories: 2,
      story: makeStory("US-2", "Second"),
    });

    expect(f.logSuccess).toHaveBeenCalledTimes(2);
    expect(f.mockProgressBar.advance).toHaveBeenCalledTimes(2);
  });

  test("mixed story_complete and story_error both advance the progress bar", () => {
    const f = makeHandlerFixtures();
    f.storyProgressRef.current = f.mockProgressBar;
    const handler = createProgressHandler(
      true,
      f.querySpinner,
      f.storyProgressRef,
      f.print,
      f.logSuccess,
      f.logError,
      f.makeProgress,
    );

    handler({
      type: "story_complete",
      completedStories: 1,
      totalStories: 2,
      story: makeStory("US-1", "OK"),
    });
    handler({
      type: "story_error",
      completedStories: 2,
      totalStories: 2,
      story: makeStory("US-2"),
      error: "failed",
    });

    expect(f.mockProgressBar.advance).toHaveBeenCalledTimes(2);
    expect(f.logSuccess).toHaveBeenCalledTimes(1);
    expect(f.logError).toHaveBeenCalledTimes(1);
  });
});
