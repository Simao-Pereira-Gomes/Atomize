import { describe, expect, it } from "vitest";
import { canLoadMore, describeRow, emptyFilters, PAGE_SIZE, parseStoryRows, toSearchRequest } from "../story-browser-model";

describe("Story Browser model", () => {
  it("sends only the filters in effect, with the page size so far", () => {
    expect(toSearchRequest(emptyFilters(false), PAGE_SIZE)).toEqual({ limit: 50 });
    expect(toSearchRequest({ ...emptyFilters(true), text: "  login ", areaPaths: ["P\\Web"] }, 100))
      .toEqual({ text: "login", areaPaths: ["P\\Web"], hasTasks: true, limit: 100 });
  });

  it("reads Story rows from a sidecar response, ignoring malformed ones", () => {
    expect(parseStoryRows({ stories: [{ id: "42", title: "Login", type: "User Story", state: "Active", taskCount: 2 }, { id: 7 }, "x"] }))
      .toEqual([{ id: "42", title: "Login", type: "User Story", state: "Active", taskCount: 2 }]);
    expect(parseStoryRows({})).toEqual([]);
  });

  it("offers Load more only while a page fills up, to the maximum", () => {
    expect(canLoadMore(50, 50)).toBe(true);
    expect(canLoadMore(12, 50)).toBe(false);
    expect(canLoadMore(500, 500)).toBe(false);
  });

  it("describes a Story's type, state, and Task count", () => {
    expect(describeRow({ id: "1", title: "T", type: "Bug", state: "Done", taskCount: 1 })).toBe("Bug · Done · 1 task");
  });
});
