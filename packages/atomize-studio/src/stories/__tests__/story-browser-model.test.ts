import { describe, expect, it } from "vitest";
import { canLoadMore, describeRow, emptyFilters, loadedSummary, MAX_STORIES, PAGE_SIZE, parseStoryRows, toSearchRequest } from "../story-browser-model";

describe("Story Browser model", () => {
  it("sends only the filters in effect, with the page size so far", () => {
    expect(toSearchRequest(emptyFilters(false), PAGE_SIZE)).toEqual({ limit: 100 });
    expect(toSearchRequest({ ...emptyFilters(true), text: "  login ", areaPaths: ["P\\Web"] }, 100))
      .toEqual({ text: "login", areaPaths: ["P\\Web"], hasTasks: true, limit: 100 });
  });

  it("reads Story rows from a sidecar response, ignoring malformed ones", () => {
    expect(parseStoryRows({ stories: [{ id: "42", title: "Login", type: "User Story", state: "Active", taskCount: 2 }, { id: 7 }, "x"] }))
      .toEqual([{ id: "42", title: "Login", type: "User Story", state: "Active", taskCount: 2 }]);
    expect(parseStoryRows({})).toEqual([]);
  });

  it("offers Load more only while a page fills up, to the maximum", () => {
    expect(canLoadMore(100, 100)).toBe(true);
    expect(canLoadMore(12, 100)).toBe(false);
    expect(canLoadMore(500, 500)).toBe(false);
  });

  it("says how many Stories are loaded and whether more can load", () => {
    expect(loadedSummary(0, 0, { more: false, atMax: false })).toBe("");
    expect(loadedSummary(100, 100, { more: true, atMax: false })).toBe("100 Stories loaded · more available");
    expect(loadedSummary(1, 1, { more: false, atMax: false })).toBe("1 Story loaded · all loaded");
    expect(loadedSummary(12, 140, { more: false, atMax: false })).toBe("Showing 12 of 140 Stories loaded · all loaded");
    expect(loadedSummary(MAX_STORIES, MAX_STORIES, { more: false, atMax: true })).toBe(`${MAX_STORIES} Stories loaded · the newest ${MAX_STORIES}; narrow the search to reach older ones`);
  });

  it("describes a Story's type, state, and Task count", () => {
    expect(describeRow({ id: "1", title: "T", type: "Bug", state: "Done", taskCount: 1 })).toBe("Bug · Done · 1 task");
  });
});
