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

function project(failures: Error[] = []) {
  const connects: (string | undefined)[] = [];
  const adapter = {
    getEstimationDefaults: () => ({ storyEstimateFields: [], taskWorkItemType: "Task", taskEstimateFields: [], unitLabel: "hours" }),
    getWorkItemTypes: async () => ["Bug"],
    getStatesForWorkItemType: async () => ["New"],
    getAreaPaths: async () => [],
    getIterationPaths: async () => [],
    getTeams: async () => [],
    listSavedQueries: async () => [],
    getFieldSchemas: async () => [],
  } as unknown as IPlatformAdapter;
  const connect = async (profile?: string) => {
    connects.push(profile);
    const failure = failures.shift();
    if (failure) throw failure;
    return adapter;
  };
  return { connect, connects };
}

async function resolve(options: GroundingInput, deps: { interactive: boolean; failures?: Error[] }) {
  const fake = project(deps.failures);
  const grounding = await resolveDraftGrounding(options, { connect: fake.connect, interactive: deps.interactive });
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
    expect(prompts).toEqual([]);
  });

  test("--ai alone is an Ungrounded Draft, with no prompt and no platform call", async () => {
    const { grounding, connects } = await resolve({ ai: true }, { interactive: true });
    expect(grounding.projectGrounding).toBeNull();
    expect(connects).toEqual([]);
    expect(prompts).toEqual([]);
  });

  test("choosing AI from the menu asks only whether to ground the draft, never for example Stories", async () => {
    answers = ["project"];
    const grounded = await resolve({}, { interactive: true });
    expect(grounded.grounding.projectGrounding).not.toBeNull();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Ground the draft in your Azure DevOps project");

    answers = ["none"];
    const ungrounded = await resolve({}, { interactive: true });
    expect(ungrounded.grounding.projectGrounding).toBeNull();
    expect(ungrounded.connects).toEqual([]);
  });

  test("a failure can be retried", async () => {
    answers = ["retry"];
    const { grounding, connects } = await resolve({ ai: true, ground: true }, { interactive: true, failures: [new Error("socket hang up")] });
    expect(connects).toHaveLength(2);
    expect(grounding.projectGrounding).not.toBeNull();
  });

  test("a failure can continue without grounding only by the user's choice", async () => {
    answers = ["ungrounded"];
    const { grounding } = await resolve({ ai: true, ground: true }, { interactive: true, failures: [new AuthError("Authentication failed: access denied", "azure-devops")] });
    expect(grounding.projectGrounding).toBeNull();
    expect(prompts[0]).toContain("could not sign in");
  });

  test("a failure can cancel the draft", async () => {
    answers = ["cancel"];
    await expect(resolve({ ai: true, ground: true }, { interactive: true, failures: [new Error("socket hang up")] }))
      .rejects.toBeInstanceOf(CancellationError);
  });

  test("a non-interactive failure stops with an error naming what was asked for", async () => {
    const ground = await resolve({ ai: true, ground: true }, { interactive: false, failures: [new Error("socket hang up")] }).catch((e: unknown) => e);
    expect(ground).toBeInstanceOf(ConfigurationError);
    expect((ground as Error).message).toContain("--ground");
  });
});
