import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every prompt answers from one ordered script, so each test reads as the CLI conversation.
let answers: unknown[] = [];
const next = mock(async () => {
  if (answers.length === 0) throw new Error("The CLI asked more questions than the script answers");
  return answers.shift();
});

mock.module("@clack/prompts", () => ({
  isTTY: () => true,
  isCI: () => false,
  isCancel: () => false,
  cancel: mock(),
  intro: mock(),
  outro: mock(),
  confirm: next,
  select: next,
  text: next,
  log: { info: mock(), warn: mock(), success: mock(), error: mock(), message: mock(), step: mock() },
  spinner: () => ({ start() {}, stop() {}, message() {} }),
}));

import type { AITemplateSession } from "@sppg2001/atomize-core/services/template/ai-template-loop";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import { parse } from "yaml";
import { type ImproveLibrary, type ImproveOptions, runTemplateImprove } from "@/cli/commands/template/template-improve.command";

const SOURCE = `# Owned by the platform team
version: "1.0"
name: Backend API
filter:
  workItemTypes: ["User Story"]
tasks:
  - title: Implementation
    estimationPercent: 70
  - title: Testing
    estimationPercent: 30
`;

const PROPOSAL = `version: "1.0"
name: Backend API
filter:
  workItemTypes: ["User Story"]
tasks:
  - title: Implementation
    estimationPercent: 60
  - title: Testing
    estimationPercent: 30
  - title: Code review
    estimationPercent: 10
improvementNotes:
  - Added a code review task.
`;

let dir: string;
let sourcePath: string;

/** A Template library over one file, optionally presented as a Catalog Template, that records saves. */
function library(options: { catalogRef?: string; builtin?: boolean; existing?: string[] } = {}) {
  const saved: { name: string; template: TaskTemplate }[] = [];
  const lib: ImproveLibrary = {
    loadSource: (async () => ({
      template: parse(SOURCE),
      meta: { isComposed: false, mixinRefs: [], resolvedMixinPaths: [] },
      source: options.catalogRef
        ? { kind: "catalog", input: options.catalogRef, ref: options.catalogRef, path: sourcePath }
        : { kind: "file", input: sourcePath, path: sourcePath },
    })) as unknown as ImproveLibrary["loadSource"],
    composeTemplate: async (raw) => raw as TaskTemplate,
    getCatalog: (async () => ({ items: options.builtin ? [{ path: sourcePath, scope: "builtin" }] : [] })) as unknown as ImproveLibrary["getCatalog"],
    userTemplateExists: async (_kind, name) => (options.existing ?? []).includes(name),
    saveTemplate: (async ({ name, template }: { name: string; template: TaskTemplate }) => {
      saved.push({ name, template });
      return { path: join(dir, `${name}.yaml`) };
    }) as unknown as ImproveLibrary["saveTemplate"],
  };
  return { lib, saved };
}

function session(outputs: string[] = [PROPOSAL]) {
  const prompts: string[] = [];
  const fake: AITemplateSession = {
    generate: async (_system, user) => {
      prompts.push(user);
      return outputs[Math.min(prompts.length - 1, outputs.length - 1)] ?? "";
    },
  };
  return { fake, prompts };
}

/** An Azure DevOps project with Stories 42 (two Tasks) and 7 (no Tasks), as grounding sees it. */
function project(options: { failConnect?: boolean } = {}) {
  const connects: (string | undefined)[] = [];
  const stories: Record<string, { item: Record<string, unknown>; children: Record<string, unknown>[] }> = {
    "42": {
      item: { id: "42", title: "Login API", type: "User Story", state: "Done", description: "<p>Customer Acme login</p>", customFields: {} },
      children: [
        { id: "421", title: "Implementation", type: "Task", state: "Done", customFields: { "Microsoft.VSTS.Scheduling.OriginalEstimate": 8 } },
        { id: "422", title: "Security review", type: "Task", state: "Done", customFields: { "Microsoft.VSTS.Scheduling.OriginalEstimate": 2 } },
      ],
    },
    "7": { item: { id: "7", title: "Empty", type: "User Story", state: "New" }, children: [] },
  };
  const adapter = {
    getEstimationDefaults: () => ({ storyEstimateFields: [], taskWorkItemType: "Task", taskEstimateFields: ["Microsoft.VSTS.Scheduling.OriginalEstimate"], unitLabel: "hours" }),
    getWorkItemTypes: async () => ["PROJECT-TYPE-MARKER"],
    getStatesForWorkItemType: async () => ["New"],
    getAreaPaths: async () => [],
    getIterationPaths: async () => [],
    getTeams: async () => [],
    listSavedQueries: async () => [],
    getFieldSchemas: async () => [],
    getWorkItem: async (id: string) => stories[id]?.item ?? null,
    getChildren: async (id: string) => stories[id]?.children ?? [],
  };
  const connect = async (profile?: string) => {
    connects.push(profile);
    if (options.failConnect) throw new Error("socket hang up");
    return adapter as never;
  };
  return { connect, connects };
}

async function run(
  options: ImproveOptions,
  deps: { lib: ImproveLibrary; interactive?: boolean; outputs?: string[]; connect?: ReturnType<typeof project>["connect"]; picked?: string[] },
) {
  const { fake, prompts } = session(deps.outputs);
  const report = await runTemplateImprove(sourcePath, options, {
    library: deps.lib,
    openSession: async () => fake,
    connect: deps.connect ?? (async () => { throw new Error("grounding was not expected"); }),
    browseStories: async () => deps.picked ?? [],
    interactive: deps.interactive ?? false,
  });
  return { report, prompts };
}

describe("atomize template improve", () => {
  beforeEach(async () => {
    answers = [];
    dir = await mkdtemp(join(tmpdir(), "atomize-improve-"));
    sourcePath = join(dir, "backend.atomize.yaml");
    await writeFile(sourcePath, SOURCE, "utf8");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("--dry-run shows the proposal but never writes anything", async () => {
    const { lib, saved } = library();
    const { report } = await run({ dryRun: true, overwrite: true }, { lib });

    expect(report.ok).toBe(true);
    expect(report.diff?.taskChanges.some((t) => t.status === "added")).toBe(true);
    expect(report.saved).toBeNull();
    expect(saved).toEqual([]);
    expect(await readFile(sourcePath, "utf8")).toBe(SOURCE);
  });

  test("never changes the source without --overwrite or a confirmation", async () => {
    const { lib, saved } = library();
    const { report } = await run({}, { lib, interactive: false });

    expect(report.ok).toBe(true);
    expect(report.saved).toBeNull();
    expect(saved).toEqual([]);
    expect(await readFile(sourcePath, "utf8")).toBe(SOURCE);
  });

  test("--overwrite writes the improvement over the source, keeping its comments", async () => {
    const { lib } = library();
    const { report } = await run({ overwrite: true }, { lib });

    const written = await readFile(sourcePath, "utf8");
    expect(report.saved).toEqual({ action: "overwrite", path: sourcePath });
    expect(written).toContain("# Owned by the platform team");
    expect(parse(written).tasks.map((t: { title: string }) => t.title)).toEqual(["Implementation", "Testing", "Code review"]);
  });

  test("choosing Save changes in an interactive run is the confirmation", async () => {
    const { lib } = library();
    answers = ["", "none", "overwrite"];
    await run({}, { lib, interactive: true });
    expect(await readFile(sourcePath, "utf8")).toContain("Code review");
  });

  test("Reject in an interactive run leaves everything as it was", async () => {
    const { lib, saved } = library();
    answers = ["", "none", "reject"];
    const { report } = await run({}, { lib, interactive: true });
    expect(report.saved).toBeNull();
    expect(saved).toEqual([]);
    expect(await readFile(sourcePath, "utf8")).toBe(SOURCE);
  });

  test("--save-as saves a new Template with the Catalog source as its origin, leaving the source untouched", async () => {
    const { lib, saved } = library({ catalogRef: "template:backend-api" });
    const { report } = await run({ saveAs: "backend-api-v2" }, { lib });

    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("backend-api-v2");
    expect(saved[0]?.template.name).toBe("Backend API (improved)");
    expect(saved[0]?.template.origin).toBe("template:backend-api");
    expect(report.saved?.action).toBe("save-as");
    expect(await readFile(sourcePath, "utf8")).toBe(SOURCE);
  });

  test("--save-as from a standalone file leaves out origin", async () => {
    const { lib, saved } = library();
    await run({ saveAs: "copy" }, { lib });
    expect(saved[0]?.template).not.toHaveProperty("origin");
  });

  test("--save-as refuses to replace an existing Template", async () => {
    const { lib, saved } = library({ existing: ["taken"] });
    await expect(run({ saveAs: "taken" }, { lib })).rejects.toThrow('A Template named "taken" already exists');
    expect(saved).toEqual([]);
  });

  test("never overwrites a built-in Template", async () => {
    const { lib } = library({ catalogRef: "template:backend-api", builtin: true });
    await expect(run({ overwrite: true }, { lib })).rejects.toThrow("Built-in Templates can't be changed");
    expect(await readFile(sourcePath, "utf8")).toBe(SOURCE);
  });

  test("--strict treats validation warnings as errors and saves nothing", async () => {
    // Percentages adding up to 110% are a warning, not an error.
    const overAllocated = PROPOSAL.replace("estimationPercent: 60", "estimationPercent: 70");
    const { lib } = library();

    const lenient = await run({ dryRun: true }, { lib, outputs: [overAllocated] });
    expect(lenient.report.ok).toBe(true);
    expect(lenient.report.validation.warnings.length).toBeGreaterThan(0);

    const strict = await run({ strict: true, overwrite: true }, { lib, outputs: [overAllocated] });
    expect(strict.report.ok).toBe(false);
    expect(strict.report.validation.errors).toEqual(lenient.report.validation.warnings);
    expect(await readFile(sourcePath, "utf8")).toBe(SOURCE);
  });

  test("--output writes the documented report fields", async () => {
    const { lib } = library({ catalogRef: "template:backend-api" });
    const reportPath = join(dir, "report.json");
    await run({ dryRun: true, output: reportPath, guidance: "Add reviews" }, { lib });

    const written = JSON.parse(await readFile(reportPath, "utf8"));
    expect(Object.keys(written).sort()).toEqual([
      "diff", "groundingStoryIds", "guidance", "notes", "ok", "saved", "sensitiveContextIncluded", "template", "validation",
    ]);
    expect(written.template).toBe("template:backend-api");
    expect(written.guidance).toBe("Add reviews");
    expect(written.notes).toEqual(["Added a code review task."]);
    expect(written.groundingStoryIds).toEqual([]);
    expect(written.sensitiveContextIncluded).toBe(false);
    expect(written.validation.valid).toBe(true);
  });

  test("--guidance reaches the prompt; without it an interactive run asks, and blank means a general review", async () => {
    const { lib } = library();
    const guided = await run({ dryRun: true, guidance: "Tighten the estimates" }, { lib });
    expect(guided.prompts[0]).toContain("Tighten the estimates");

    answers = ["", "none"];
    const general = await run({ dryRun: true }, { lib, interactive: true });
    expect(general.prompts[0]).not.toContain("focus on");
  });

  test("a proposal still invalid after repairs fails the run and saves nothing", async () => {
    const { lib, saved } = library();
    const broken = PROPOSAL.replace("title: Code review", 'title: ""');
    const { report } = await run({ overwrite: true }, { lib, outputs: [broken] });
    expect(report.ok).toBe(false);
    expect(report.validation.errors.length).toBeGreaterThan(0);
    expect(saved).toEqual([]);
    expect(await readFile(sourcePath, "utf8")).toBe(SOURCE);
  });

  describe("grounding", () => {
    test("--from-stories learns from exactly those Stories and brings Project Grounding with it", async () => {
      const { lib } = library();
      const { connect, connects } = project();
      const { report, prompts } = await run({ dryRun: true, fromStories: "42", profile: "work" }, { lib, connect });

      expect(connects).toEqual(["work"]);
      expect(prompts[0]).toContain("Stories this template was applied to");
      expect(prompts[0]).toContain("Security review");
      expect(prompts[0]).toContain("PROJECT-TYPE-MARKER");
      expect(report.groundingStoryIds).toEqual(["42"]);
      expect(report.sensitiveContextIncluded).toBe(false);
    });

    test("leaves out descriptions unless --include-sensitive-ai-context is passed", async () => {
      const { lib } = library();
      const without = await run({ dryRun: true, fromStories: "42" }, { lib, connect: project().connect });
      expect(without.prompts[0]).not.toContain("Customer Acme");

      const withSensitive = await run({ dryRun: true, fromStories: "42", includeSensitiveAiContext: true }, { lib, connect: project().connect });
      expect(withSensitive.prompts[0]).toContain("Customer Acme login");
      expect(withSensitive.report.sensitiveContextIncluded).toBe(true);
    });

    test("--ground alone brings Project Grounding without Stories", async () => {
      const { lib } = library();
      const { report, prompts } = await run({ dryRun: true, ground: true }, { lib, connect: project().connect });
      expect(prompts[0]).toContain("PROJECT-TYPE-MARKER");
      expect(prompts[0]).not.toContain("Stories this template was applied to");
      expect(report.groundingStoryIds).toEqual([]);
    });

    test("an ungrounded run never connects to the platform", async () => {
      const { lib } = library();
      const { connect, connects } = project();
      await run({ dryRun: true }, { lib, connect });
      expect(connects).toEqual([]);
    });

    test("a non-interactive grounding failure stops with an error and saves nothing", async () => {
      const { lib, saved } = library();
      await expect(run({ overwrite: true, fromStories: "42" }, { lib, connect: project({ failConnect: true }).connect }))
        .rejects.toThrow("--from-stories");
      expect(saved).toEqual([]);
      expect(await readFile(sourcePath, "utf8")).toBe(SOURCE);
    });

    test("names Stories that can't be used instead of skipping them", async () => {
      const { lib } = library();
      await expect(run({ dryRun: true, fromStories: "42,7" }, { lib, connect: project().connect })).rejects.toThrow("Story 7 has no Tasks");
    });

    test("an interactive run can pick Stories from the Story Browser and choose Sensitive AI Context", async () => {
      const { lib } = library();
      answers = ["", "pick", true];
      const { report, prompts } = await run({ dryRun: true }, { lib, interactive: true, connect: project().connect, picked: ["42"] });
      expect(report.groundingStoryIds).toEqual(["42"]);
      expect(report.sensitiveContextIncluded).toBe(true);
      expect(prompts[0]).toContain("Customer Acme login");
    });

    test("an interactive grounding failure can continue without grounding, by choice", async () => {
      const { lib } = library();
      answers = ["", "project", "ungrounded"];
      const { report, prompts } = await run({ dryRun: true }, { lib, interactive: true, connect: project({ failConnect: true }).connect });
      expect(report.ok).toBe(true);
      expect(prompts[0]).not.toContain("Project metadata");
    });
  });
});
