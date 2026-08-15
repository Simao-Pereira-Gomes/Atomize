import { describe, expect, it } from "vitest";
import { parseGenerateProgressEvent, parseGenerateReport, parseGenerateStories } from "../live";

describe("parseGenerateStories", () => {
  it("parses well-formed WorkItems, keeping optional fields", () => {
    const value = { stories: [{ id: "1031", title: "Add OAuth login", url: "https://dev.azure.com/x/_workitems/edit/1031", type: "User Story", state: "Active", areaPath: "Contoso\\Web" }] };
    expect(parseGenerateStories(value)).toEqual([{ id: "1031", title: "Add OAuth login", url: "https://dev.azure.com/x/_workitems/edit/1031", type: "User Story", state: "Active", areaPath: "Contoso\\Web" }]);
  });

  it("drops malformed entries missing id or title rather than throwing", () => {
    const value = { stories: [{ id: "1031", title: "Add OAuth login" }, { title: "no id" }, { id: "1032" }] };
    expect(parseGenerateStories(value)).toEqual([{ id: "1031", title: "Add OAuth login" }]);
  });

  it("rejects a response with no stories array", () => {
    expect(() => parseGenerateStories({})).toThrow("unexpected response");
  });
});

describe("parseGenerateReport", () => {
  it("parses a well-formed report, deriving counts when omitted", () => {
    const value = {
      report: {
        results: [
          { story: { id: "1031", title: "Add OAuth login" }, tasksCreated: [{ id: "5001", title: "Design" }], success: true },
          { story: { id: "1044", title: "Rework the digest job" }, tasksCreated: [], success: false, error: "TF401320: rule violation" },
        ],
      },
    };
    expect(parseGenerateReport(value)).toEqual({
      storiesProcessed: 2,
      storiesSuccess: 1,
      storiesFailed: 1,
      tasksCreated: 1,
      results: [
        { story: { id: "1031", title: "Add OAuth login" }, tasksCreated: [{ id: "5001", title: "Design" }], success: true, error: undefined },
        { story: { id: "1044", title: "Rework the digest job" }, tasksCreated: [], success: false, error: "TF401320: rule violation" },
      ],
    });
  });

  it("prefers explicit counts over derived ones when both are present", () => {
    const value = { report: { storiesProcessed: 9, storiesSuccess: 8, storiesFailed: 1, tasksCreated: 40, results: [] } };
    expect(parseGenerateReport(value)).toMatchObject({ storiesProcessed: 9, storiesSuccess: 8, storiesFailed: 1, tasksCreated: 40 });
  });

  it("rejects a response with no report object", () => {
    expect(() => parseGenerateReport({})).toThrow("unexpected response");
  });
});

describe("parseGenerateProgressEvent", () => {
  it("parses a task_created event with its story and task", () => {
    const value = { type: "task_created", story: { id: "1031", title: "Add OAuth login" }, task: { id: "5001", title: "Design" } };
    expect(parseGenerateProgressEvent(value)).toEqual({
      type: "task_created",
      story: { id: "1031", title: "Add OAuth login" },
      task: { id: "5001", title: "Design" },
      error: undefined,
      totalStories: undefined,
      completedStories: undefined,
    });
  });

  it("returns undefined for a payload with no type", () => {
    expect(parseGenerateProgressEvent({})).toBeUndefined();
  });

  it("returns undefined for a non-object payload", () => {
    expect(parseGenerateProgressEvent("not an event")).toBeUndefined();
  });
});
