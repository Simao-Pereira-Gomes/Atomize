import { beforeEach, describe, expect, mock, test } from "bun:test";

// Every prompt answers from one ordered script, so each test reads as the CLI conversation.
let answers: unknown[] = [];
const prompts: string[] = [];
const next = mock(async (prompt?: { message?: string }) => {
  prompts.push(prompt?.message ?? "");
  if (answers.length === 0) throw new Error("The CLI asked more questions than the script answers");
  return answers.shift();
});

mock.module("@clack/prompts", () => ({
  isTTY: () => true,
  isCI: () => false,
  isCancel: () => false,
  cancel: mock(),
  confirm: next,
  select: next,
  text: next,
  multiselect: next,
  autocomplete: next,
  spinner: () => ({ start() {}, stop() {}, message() {} }),
}));

import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import { AuthError, CancellationError, ConfigurationError } from "@sppg2001/atomize-core/utils/errors";
import { type GroundingInput, resolveDraftGrounding } from "@/cli/commands/template/ai-creation/grounding";

/** A project with example Story 42 (two Tasks) and Story 7 (none), as grounding sees it. */
function project(failures: Error[] = []) {
  const connects: (string | undefined)[] = [];
  const stories: Record<string, { item: Record<string, unknown>; children: Record<string, unknown>[] }> = {
    "42": {
      item: { id: "42", title: "Bug triage", type: "Bug", state: "Done", description: "<p>Customer Acme</p>", customFields: {} },
      children: [{ id: "421", title: "Reproduce", type: "Task", state: "Done", customFields: {} }],
    },
    "7": { item: { id: "7", title: "Empty", type: "Bug", state: "New" }, children: [] },
  };
  const adapter = {
    getEstimationDefaults: () => ({ storyEstimateFields: [], taskWorkItemType: "Task", taskEstimateFields: [], unitLabel: "hours" }),
    getWorkItemTypes: async () => ["Bug"],
    getStatesForWorkItemType: async () => ["New"],
    getAreaPaths: async () => [],
    getIterationPaths: async () => [],
    getTeams: async () => [],
    listSavedQueries: async () => [],
    getFieldSchemas: async () => [],
    getWorkItem: async (id: string) => stories[id]?.item ?? null,
    getChildren: async (id: string) => stories[id]?.children ?? [],
  } as unknown as IPlatformAdapter;
  const connect = async (profile?: string) => {
    connects.push(profile);
    const failure = failures.shift();
    if (failure) throw failure;
    return adapter;
  };
  return { connect, connects };
}

async function resolve(options: GroundingInput, deps: { interactive: boolean; failures?: Error[]; picked?: string[] }) {
  const fake = project(deps.failures);
  const grounding = await resolveDraftGrounding(options, {
    connect: fake.connect,
    interactive: deps.interactive,
    browse: async () => deps.picked ?? [],
  });
  return { grounding, connects: fake.connects };
}

describe("resolveDraftGrounding", () => {
  beforeEach(() => {
    answers = [];
    prompts.length = 0;
  });

  test("--ground brings Project Grounding from the chosen profile", async () => {
    const { grounding, connects } = await resolve({ ai: true, ground: true, profile: "work" }, { interactive: false });
    expect(connects).toEqual(["work"]);
    expect(grounding.projectGrounding?.workItemTypes).toEqual(["Bug"]);
    expect(grounding.storyGrounding).toBeNull();
    expect(prompts).toEqual([]);
  });

  test("--ai alone is an Ungrounded Draft, with no prompt and no platform call", async () => {
    const { grounding, connects } = await resolve({ ai: true }, { interactive: true });
    expect(grounding.projectGrounding).toBeNull();
    expect(connects).toEqual([]);
    expect(prompts).toEqual([]);
  });

  test("choosing AI from the menu asks whether to ground the draft, then whether to add example Stories", async () => {
    answers = ["project", "none"];
    const grounded = await resolve({}, { interactive: true });
    expect(grounded.grounding.projectGrounding).not.toBeNull();
    expect(prompts[0]).toContain("Ground the draft in your Azure DevOps project");
    expect(prompts[1]).toContain("Add example Stories");

    answers = ["none"];
    const ungrounded = await resolve({}, { interactive: true });
    expect(ungrounded.grounding.projectGrounding).toBeNull();
    expect(ungrounded.connects).toEqual([]);
  });

  test("--from-stories grounds in exactly those example Stories, with project metadata and no prompts", async () => {
    const { grounding } = await resolve({ ai: true, fromStories: "#42" }, { interactive: false });
    expect(grounding.projectGrounding).not.toBeNull();
    expect(grounding.storyGrounding?.stories.map((story) => story.title)).toEqual(["Bug triage"]);
    expect(grounding.storyIds).toEqual(["42"]);
    expect(grounding.sensitiveContextIncluded).toBe(false);
    expect(JSON.stringify(grounding.storyGrounding)).not.toContain("Acme");
    expect(prompts).toEqual([]);
  });

  test("--include-sensitive-ai-context sends descriptions, for this run only", async () => {
    const { grounding } = await resolve({ ai: true, fromStories: "42", includeSensitiveAiContext: true }, { interactive: false });
    expect(grounding.sensitiveContextIncluded).toBe(true);
    expect(JSON.stringify(grounding.storyGrounding)).toContain("Customer Acme");
  });

  test("an interactive run can pick example Stories and decide about descriptions", async () => {
    answers = ["pick", false];
    const { grounding } = await resolve({ ai: true, ground: true }, { interactive: true, picked: ["42"] });
    expect(grounding.storyIds).toEqual(["42"]);
    expect(grounding.sensitiveContextIncluded).toBe(false);
    expect(prompts[1]).toContain("descriptions and acceptance criteria");
  });

  test("a failure can be retried", async () => {
    answers = ["none", "retry"];
    const { grounding, connects } = await resolve({ ai: true, ground: true }, { interactive: true, failures: [new Error("socket hang up")] });
    expect(connects).toHaveLength(2);
    expect(grounding.projectGrounding).not.toBeNull();
  });

  test("a failure can continue without grounding only by the user's choice", async () => {
    answers = ["none", "ungrounded"];
    const { grounding } = await resolve({ ai: true, ground: true }, { interactive: true, failures: [new AuthError("Authentication failed: access denied", "azure-devops")] });
    expect(grounding.projectGrounding).toBeNull();
    expect(prompts[1]).toContain("could not sign in");
  });

  test("a failure can cancel the draft", async () => {
    answers = ["none", "cancel"];
    await expect(resolve({ ai: true, ground: true }, { interactive: true, failures: [new Error("socket hang up")] }))
      .rejects.toBeInstanceOf(CancellationError);
  });

  test("a non-interactive failure stops with an error naming what was asked for", async () => {
    const ground = await resolve({ ai: true, ground: true }, { interactive: false, failures: [new Error("socket hang up")] }).catch((e: unknown) => e);
    expect(ground).toBeInstanceOf(ConfigurationError);
    expect((ground as Error).message).toContain("--ground");

    const stories = await resolve({ ai: true, fromStories: "7" }, { interactive: false }).catch((e: unknown) => e);
    expect((stories as Error).message).toContain("Story 7 has no Tasks");
    expect((stories as Error).message).toContain("--from-stories");
  });

  test("example Stories that can't be used are chosen again on retry", async () => {
    answers = ["enter", false, "7", "retry", "enter", "42"];
    const { grounding } = await resolve({ ai: true, ground: true }, { interactive: true });
    expect(grounding.storyIds).toEqual(["42"]);
  });
});
