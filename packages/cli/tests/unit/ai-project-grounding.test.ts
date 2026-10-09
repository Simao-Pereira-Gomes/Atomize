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

import type { ProjectGrounding } from "@sppg2001/atomize-core/services/template/project-grounding";
import { AuthError, CancellationError, ConfigurationError } from "@sppg2001/atomize-core/utils/errors";
import { resolveProjectGrounding } from "@/cli/commands/template/ai-creation/grounding";

const grounding = { workItemTypes: ["User Story"], savedQueries: [] } as unknown as ProjectGrounding;

function loader(...results: (ProjectGrounding | Error)[]) {
  const calls: (string | undefined)[] = [];
  const load = async (profile?: string) => {
    calls.push(profile);
    const result = results.shift();
    if (!result) throw new Error("loaded more often than scripted");
    if (result instanceof Error) throw result;
    return result;
  };
  return { load, calls };
}

describe("resolveProjectGrounding", () => {
  beforeEach(() => {
    answers = [];
    prompts.length = 0;
  });

  test("--ground loads Project Grounding from the chosen profile without asking", async () => {
    const { load, calls } = loader(grounding);
    expect(await resolveProjectGrounding({ ai: true, ground: true, profile: "work" }, { load, interactive: true })).toBe(grounding);
    expect(calls).toEqual(["work"]);
    expect(prompts).toEqual([]);
  });

  test("--ai alone is an Ungrounded Draft, with no prompt and no platform call", async () => {
    const { load, calls } = loader();
    expect(await resolveProjectGrounding({ ai: true }, { load, interactive: true })).toBeNull();
    expect(calls).toEqual([]);
    expect(prompts).toEqual([]);
  });

  test("choosing AI from the menu asks whether to ground the draft", async () => {
    const yes = loader(grounding);
    answers = ["project"];
    expect(await resolveProjectGrounding({}, { load: yes.load, interactive: true })).toBe(grounding);
    expect(prompts[0]).toContain("Ground the draft in your Azure DevOps project");

    const no = loader();
    answers = ["none"];
    expect(await resolveProjectGrounding({}, { load: no.load, interactive: true })).toBeNull();
    expect(no.calls).toEqual([]);
  });

  test("a failure can be retried", async () => {
    const { load, calls } = loader(new Error("socket hang up"), grounding);
    answers = ["retry"];
    expect(await resolveProjectGrounding({ ground: true }, { load, interactive: true })).toBe(grounding);
    expect(calls).toHaveLength(2);
    expect(prompts[0]).toContain("could not load project metadata");
  });

  test("a failure can continue as an Ungrounded Draft only by the user's choice", async () => {
    const { load } = loader(new AuthError("Authentication failed: access denied", "azure-devops"));
    answers = ["ungrounded"];
    expect(await resolveProjectGrounding({ ground: true }, { load, interactive: true })).toBeNull();
    expect(prompts[0]).toContain("could not sign in");
  });

  test("a failure can cancel the draft", async () => {
    const { load } = loader(new Error("socket hang up"));
    answers = ["cancel"];
    await expect(resolveProjectGrounding({ ground: true }, { load, interactive: true })).rejects.toBeInstanceOf(CancellationError);
  });

  test("a non-interactive --ground failure stops with an error instead of drafting ungrounded", async () => {
    const { load } = loader(new AuthError("Authentication failed: personal access token expired", "azure-devops"));
    const error = await resolveProjectGrounding({ ground: true }, { load, interactive: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toContain("expired");
    expect((error as Error).message).toContain("--ground");
    expect(prompts).toEqual([]);
  });

  test("a non-interactive run without --ground is ungrounded without asking", async () => {
    const { load, calls } = loader();
    expect(await resolveProjectGrounding({}, { load, interactive: false })).toBeNull();
    expect(calls).toEqual([]);
  });
});
