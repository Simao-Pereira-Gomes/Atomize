import { beforeEach, describe, expect, mock, test } from "bun:test";

// Every prompt answers from one ordered script and records what it offered.
let answers: unknown[] = [];
const offered: { message: string; options: { value: string; label: string; hint?: string }[] }[] = [];
const next = mock(async (prompt: { message: string; options: { value: string; label: string; hint?: string }[] }) => {
  offered.push({ message: prompt.message, options: prompt.options });
  if (answers.length === 0) throw new Error("The CLI asked more questions than the script answers");
  return answers.shift();
});

mock.module("@clack/prompts", () => ({
  isTTY: () => true,
  isCI: () => false,
  isCancel: () => false,
  cancel: mock(),
  autocomplete: next,
  autocompleteMultiselect: next,
}));

import type { WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import { browseStoriesInTerminal } from "@/cli/utilities/story-browser";

const item = (id: string, childCount: number, created: string): WorkItem => ({
  id, title: `Story ${id}`, type: "User Story", state: "Active", childCount, createdDate: new Date(created),
});

function adapter(applied: WorkItem[]) {
  const searches: unknown[] = [];
  const fake = {
    getConnectUserEmail: async () => "",
    getEstimationDefaults: () => ({ storyEstimateFields: [], taskWorkItemType: "Task", taskEstimateFields: [], unitLabel: "hours" }),
    queryWorkItems: async () => applied,
    searchStories: async (search: unknown) => {
      searches.push(search);
      return [item("900", 3, "2024-03-01")];
    },
    getFieldSchemas: async () => [],
    getWorkItemTypes: async () => [],
    getStatesForWorkItemType: async () => [],
    getAreaPaths: async () => ["Proj", "Proj\\Web"],
    getIterationPaths: async () => ["Proj\\Sprint 1"],
    getTeams: async () => [],
  };
  return { fake: fake as never, searches };
}

describe("browseStoriesInTerminal", () => {
  beforeEach(() => {
    answers = [];
    offered.length = 0;
  });

  test("opens on Stories the Template was applied to, with their Task counts, and returns the picked IDs", async () => {
    const { fake } = adapter([item("1", 2, "2024-01-01"), item("2", 0, "2024-01-03"), item("3", 1, "2024-01-02")]);
    answers = [["3", "1"]];

    const ids = await browseStoriesInTerminal(fake, { message: "Pick", templateFilter: {} });

    expect(ids).toEqual(["3", "1"]);
    expect(offered[0]?.options.map((o) => o.value)).toEqual(["3", "1", "__search__"]);
    expect(offered[0]?.options[0]).toMatchObject({ label: "#3 Story 3", hint: "1 task" });
  });

  test("can switch to a Story Search narrowed by area and iteration", async () => {
    const { fake, searches } = adapter([item("1", 2, "2024-01-01")]);
    answers = [["__search__"], "Proj\\Web", "__any__", ["900"]];

    const ids = await browseStoriesInTerminal(fake, { message: "Pick", templateFilter: {} });

    expect(ids).toEqual(["900"]);
    expect(searches[0]).toMatchObject({ areaPaths: ["Proj\\Web"], hasTasks: true });
    expect(searches[0]).not.toHaveProperty("iterations");
  });

  test("goes straight to Search when no Story the Template matches has Tasks yet", async () => {
    const { fake, searches } = adapter([item("2", 0, "2024-01-03")]);
    answers = ["__any__", "__any__", ["900"]];

    expect(await browseStoriesInTerminal(fake, { message: "Pick", templateFilter: {} })).toEqual(["900"]);
    expect(searches).toHaveLength(1);
  });
});
