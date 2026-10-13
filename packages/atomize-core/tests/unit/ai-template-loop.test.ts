import { describe, expect, test } from "bun:test";
import {
  type AITemplateSession,
  draftTemplate,
  improveTemplate,
} from "@sppg2001/atomize-core/services/template/ai-template-loop";
import { MAX_ATTEMPTS } from "@sppg2001/atomize-core/services/template/llm-template-generator";
import type { ProjectGrounding } from "@sppg2001/atomize-core/services/template/project-grounding";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import { CancellationError } from "@sppg2001/atomize-core/utils/errors";
import { parse } from "yaml";

const VALID = `version: "1.0"
name: "Backend API"
filter:
  workItemTypes: ["User Story"]
  states: ["Active"]
tasks:
  - title: "Implementation"
    estimationPercent: 70
  - title: "Testing"
    estimationPercent: 30
`;

const SHAPED_BUT_INVALID = `version: "1.0"
name: "Draft"
filter: {}
tasks:
  - title: ""
    estimationPercent: 120
`;

type Call = { kind: "generate" | "stream"; systemPrompt: string; userPrompt: string };

/** A session that answers each call with the next scripted output. */
function scriptedSession(outputs: string[], options: { stream?: boolean } = {}) {
  const calls: Call[] = [];
  let next = 0;
  const take = () => outputs[Math.min(next++, outputs.length - 1)] ?? "";
  const session: AITemplateSession = {
    generate: async (systemPrompt, userPrompt) => {
      calls.push({ kind: "generate", systemPrompt, userPrompt });
      return take();
    },
  };
  if (options.stream) {
    session.stream = async function* (systemPrompt, userPrompt) {
      calls.push({ kind: "stream", systemPrompt, userPrompt });
      const output = take();
      yield output.slice(0, 10);
      yield output.slice(10);
    };
  }
  return { session, calls };
}

describe("draftTemplate", () => {
  test("repairs a final allocation range failure using validation feedback", async () => {
    const header = 'name: Bounded\nfilter: {}\nestimation:\n  normalize: always\nvalidation:\n  taskEstimationRange: { min: 10, max: 30 }\ntasks:\n';
    const invalid = `${header}  - title: Single\n    estimationPercent: 20\n`;
    const valid = `${header}${Array.from({ length: 4 }, (_, i) => `  - title: Task ${i}\n    estimationPercent: 50\n`).join("")}`;
    const { session, calls } = scriptedSession([invalid, valid]);
    const result = await draftTemplate(session, { prose: "Every final task allocation must be 10–30%." });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.systemPrompt).toContain("AFTER normalization");
    expect(calls[1]?.userPrompt).toContain("Final task allocation is 100%");
  });
  test("returns the Template when the first attempt is valid", async () => {
    const { session, calls } = scriptedSession([VALID]);

    const result = await draftTemplate(session, { prose: "Backend API stories" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.name).toBe("Backend API");
    expect(result.attempts).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.userPrompt).toContain("Backend API stories");
  });

  test("writes the draft in the current format, first, even when the model omits formatVersion", async () => {
    const { session } = scriptedSession([VALID]);

    const result = await draftTemplate(session, { prose: "Backend API stories" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.template)[0]).toBe("formatVersion");
    expect(result.template.formatVersion).toBe("1.0");
  });

  test("accepts percentages that add up to more than 100 without asking for a repair", async () => {
    const overAllocated = VALID.replace("estimationPercent: 30", "estimationPercent: 60");
    const { session, calls } = scriptedSession([overAllocated, VALID]);
    const result = await draftTemplate(session, { prose: "Dev takes the whole estimate, QA another 60% on top" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.template.tasks.map((t) => t.estimationPercent)).toEqual([70, 60]);
    expect(calls).toHaveLength(1);
  });

  test("re-prompts with the validation errors and returns the repaired Template", async () => {
    const { session, calls } = scriptedSession([SHAPED_BUT_INVALID, VALID]);

    const result = await draftTemplate(session, { prose: "Backend API stories" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.userPrompt).not.toContain("Previous attempt failed validation");
    expect(calls[1]?.userPrompt).toContain("Previous attempt failed validation");
  });

  test("gives up after the maximum attempts and returns the last raw output with its errors", async () => {
    const { session, calls } = scriptedSession(["not yaml: [unclosed"]);

    const result = await draftTemplate(session, { prose: "Anything" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(calls).toHaveLength(MAX_ATTEMPTS);
    expect(result.attempts).toBe(MAX_ATTEMPTS);
    expect(result.rawOutput).toBe("not yaml: [unclosed");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.template).toBeUndefined();
  });

  test("keeps a Template-shaped but invalid final output so it can still be edited", async () => {
    const { session } = scriptedSession([SHAPED_BUT_INVALID]);

    const result = await draftTemplate(session, { prose: "Anything" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.template).toEqual({
      formatVersion: "1.0",
      version: "1.0",
      name: "Draft",
      filter: {},
      tasks: [{ title: "", estimationPercent: 120 }],
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("streams only the first attempt and reports each chunk", async () => {
    const { session, calls } = scriptedSession([SHAPED_BUT_INVALID, VALID], { stream: true });
    const chunks: string[] = [];

    const result = await draftTemplate(session, { prose: "Anything" }, { onChunk: (chunk) => chunks.push(chunk) });

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.kind)).toEqual(["stream", "generate"]);
    expect(chunks.join("")).toBe(SHAPED_BUT_INVALID);
  });

  test("reports each failed attempt and each repair to the caller", async () => {
    const { session } = scriptedSession([SHAPED_BUT_INVALID, SHAPED_BUT_INVALID, VALID]);
    const events: string[] = [];

    await draftTemplate(session, { prose: "Anything" }, {
      onAttemptInvalid: (attempt) => events.push(`invalid:${attempt}`),
      onRepairStart: (attempt) => events.push(`repair:${attempt}`),
      onRepairOutput: (attempt) => events.push(`output:${attempt}`),
    });

    expect(events).toEqual(["invalid:1", "repair:2", "output:2", "invalid:2", "repair:3", "output:3"]);
  });

  test("includes Project Grounding in the prompt only when supplied", async () => {
    const without = scriptedSession([VALID]);
    await draftTemplate(without.session, { prose: "Anything" });
    expect(without.calls[0]?.userPrompt).not.toContain("GROUNDING-MARKER");

    const withGrounding = scriptedSession([VALID]);
    const projectGrounding = { workItemTypes: ["GROUNDING-MARKER"] } as unknown as ProjectGrounding;
    await draftTemplate(withGrounding.session, { prose: "Anything", projectGrounding });
    expect(withGrounding.calls[0]?.userPrompt).toContain("GROUNDING-MARKER");
  });

  test("throws a CancellationError without calling the session when already cancelled", async () => {
    const { session, calls } = scriptedSession([VALID]);
    const controller = new AbortController();
    controller.abort();

    await expect(draftTemplate(session, { prose: "Anything" }, { signal: controller.signal })).rejects.toBeInstanceOf(CancellationError);
    expect(calls).toHaveLength(0);
  });

  test("stops mid-stream when cancelled", async () => {
    const controller = new AbortController();
    const session: AITemplateSession = {
      generate: async () => { throw new Error("generate should not be reached"); },
      stream: async function* () {
        yield "version: ";
        controller.abort();
        yield '"1.0"';
      },
    };
    const chunks: string[] = [];

    await expect(draftTemplate(session, { prose: "Anything" }, { signal: controller.signal, onChunk: (chunk) => chunks.push(chunk) }))
      .rejects.toBeInstanceOf(CancellationError);
    expect(chunks).toEqual(["version: "]);
  });

  test("does not start a repair attempt once cancelled between attempts", async () => {
    const controller = new AbortController();
    let calls = 0;
    const session: AITemplateSession = {
      generate: async () => {
        calls += 1;
        controller.abort();
        return SHAPED_BUT_INVALID;
      },
    };

    await expect(draftTemplate(session, { prose: "Anything" }, { signal: controller.signal })).rejects.toBeInstanceOf(CancellationError);
    expect(calls).toBe(1);
  });

  test("rejects a late result that arrives after cancellation", async () => {
    const controller = new AbortController();
    let finish!: (output: string) => void;
    const session: AITemplateSession = {
      generate: () => new Promise<string>((resolve) => { finish = resolve; }),
    };

    const draft = draftTemplate(session, { prose: "Anything" }, { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    finish(VALID);

    await expect(draft).rejects.toBeInstanceOf(CancellationError);
  });
});

describe("improveTemplate", () => {
  const plain = {
    version: "1.0",
    name: "Backend API",
    filter: { workItemTypes: ["User Story"], states: ["Active"] },
    tasks: [
      { title: "Implementation", estimationPercent: 70 },
      { title: "Testing", estimationPercent: 30 },
    ],
  } as TaskTemplate;

  const IMPROVED = `version: "1.0"
name: "Backend API"
filter:
  workItemTypes: ["User Story"]
  states: ["Active"]
tasks:
  - title: "Implement the endpoint"
    estimationPercent: 60
  - title: "Write tests"
    estimationPercent: 30
  - title: "Code review"
    estimationPercent: 10
improvementNotes:
  - "Added a code review task."
  - "Renamed tasks to say what is built."
`;

  test("returns the proposal with the AI's notes taken out of the Template", async () => {
    const { session } = scriptedSession([IMPROVED]);
    const result = await improveTemplate(session, { template: plain, resolvedTemplate: plain });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.tasks.map((t) => t.title)).toEqual(["Implement the endpoint", "Write tests", "Code review"]);
    expect(result.template).not.toHaveProperty("improvementNotes");
    expect(result.notes).toEqual(["Added a code review task.", "Renamed tasks to say what is built."]);
  });

  test("writes the proposal in the current format, first, even when the model omits formatVersion", async () => {
    const { session } = scriptedSession([IMPROVED]);
    const result = await improveTemplate(session, { template: plain, resolvedTemplate: plain });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.template)[0]).toBe("formatVersion");
    expect(result.template.formatVersion).toBe("1.0");
  });

  test("adds formatVersion to a last failed proposal kept for editing", async () => {
    const { session } = scriptedSession(['name: "Backend API"\nfilter: {}\ntasks:\n  - title: ""\n']);
    const result = await improveTemplate(session, { template: plain, resolvedTemplate: plain });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.template?.formatVersion).toBe("1.0");
  });

  test("includes guidance in the prompt only when given", async () => {
    const without = scriptedSession([IMPROVED]);
    await improveTemplate(without.session, { template: plain, resolvedTemplate: plain });
    expect(without.calls[0]?.userPrompt).not.toContain("focus on");

    const withGuidance = scriptedSession([IMPROVED]);
    await improveTemplate(withGuidance.session, { template: plain, resolvedTemplate: plain, guidance: "Tighten the estimates" });
    expect(withGuidance.calls[0]?.userPrompt).toContain("focus on:\nTighten the estimates");
  });

  test("asks to keep the Template's allocation rather than scale it to 100", async () => {
    const { session, calls } = scriptedSession([IMPROVED]);
    await improveTemplate(session, { template: plain, resolvedTemplate: plain });
    expect(calls[0]?.userPrompt).toContain("don't scale them down to 100");
  });

  test("only shows the composed form for a Template that inherits", async () => {
    const { session, calls } = scriptedSession([IMPROVED]);
    await improveTemplate(session, { template: plain, resolvedTemplate: plain });
    expect(calls[0]?.userPrompt).not.toContain("fully composed form");
  });

  describe("a Template that inherits", () => {
    const child = {
      version: "1.0",
      name: "Checkout",
      extends: "template:base-feature",
      mixins: ["mixin:security-review"],
      origin: "template:base-feature",
      filter: { workItemTypes: ["User Story"] },
      tasks: [{ id: "payments", title: "Payments integration", estimationPercent: 40 }],
    } as TaskTemplate;
    const resolved = {
      ...child,
      tasks: [
        { id: "design", title: "Design", estimationPercent: 30 },
        { id: "review", title: "Security review", estimationPercent: 30 },
        { id: "payments", title: "Payments integration", estimationPercent: 40 },
      ],
    } as TaskTemplate;
    // Composes a proposal the way the loader would: parent and Mixin Tasks first, then the child's own.
    const compose = async (proposal: Record<string, unknown>) =>
      ({ ...proposal, tasks: [...resolved.tasks.slice(0, 2), ...(proposal.tasks as TaskTemplate["tasks"])] }) as TaskTemplate;

    const REWRITES_INHERITANCE = `version: "1.0"
name: "Checkout"
extends: "template:something-else"
origin: "template:other"
filter:
  workItemTypes: ["User Story"]
tasks:
  - id: "design"
    title: "Design"
    estimationPercent: 30
  - id: "payments"
    title: "Payments integration with retries"
    estimationPercent: 40
improvementNotes:
  - "Mention retries."
`;

    test("restores extends, mixins, and origin whatever the model returns", async () => {
      const { session } = scriptedSession([REWRITES_INHERITANCE]);
      const result = await improveTemplate(session, { template: child, resolvedTemplate: resolved, compose });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.template.extends).toBe("template:base-feature");
      expect(result.template.mixins).toEqual(["mixin:security-review"]);
      expect(result.template.origin).toBe("template:base-feature");
    });

    test("leaves out inherited Tasks the model copied in, and says so", async () => {
      const { session } = scriptedSession([REWRITES_INHERITANCE]);
      const result = await improveTemplate(session, { template: child, resolvedTemplate: resolved, compose });
      if (!result.ok) throw new Error("expected a valid proposal");
      expect(result.template.tasks.map((t) => t.title)).toEqual(["Payments integration with retries"]);
      expect(result.notes).toContain("Mention retries.");
      expect(result.notes.some((note) => note.includes('"Design"') && note.includes("parent Template or a Mixin"))).toBe(true);
    });

    test("validates the proposal composed with its parent, not on its own", async () => {
      // Valid on its own, but the composed form inherits a broken parent Task.
      const overshooting = async (proposal: Record<string, unknown>) =>
        ({ ...proposal, tasks: [{ title: "", estimationPercent: 60 }, ...(proposal.tasks as TaskTemplate["tasks"])] }) as TaskTemplate;
      const composedWith: unknown[] = [];
      const { session, calls } = scriptedSession([REWRITES_INHERITANCE]);
      const result = await improveTemplate(session, {
        template: child,
        resolvedTemplate: resolved,
        compose: async (proposal) => { composedWith.push(proposal); return overshooting(proposal); },
      });
      expect(result.ok).toBe(false);
      expect(calls).toHaveLength(MAX_ATTEMPTS);
      expect(calls[0]?.userPrompt).toContain("fully composed form");
      // Composition sees the guarded proposal: inheritance restored, notes removed.
      expect(composedWith[0]).toMatchObject({ extends: "template:base-feature" });
      expect(composedWith[0]).not.toHaveProperty("improvementNotes");
    });

    test("keeps inheritance intact in an editable proposal that is still invalid", async () => {
      const { session } = scriptedSession([REWRITES_INHERITANCE.replace('"Payments integration with retries"', '""')]);
      const result = await improveTemplate(session, { template: child, resolvedTemplate: resolved, compose });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.template?.extends).toBe("template:base-feature");
      expect(result.template).not.toHaveProperty("improvementNotes");
    });
  });
});

describe("improveTemplate grounding", () => {
  const plain = {
    version: "1.0",
    name: "Backend API",
    filter: { workItemTypes: ["User Story"] },
    tasks: [{ title: "Build", estimationPercent: 100 }],
  } as TaskTemplate;
  const VALID = 'version: "1.0"\nname: "Backend API"\nfilter:\n  workItemTypes: ["User Story"]\ntasks:\n  - title: "Build"\n    estimationPercent: 100\n';

  test("sends Project Grounding when supplied", async () => {
    const { session, calls } = scriptedSession([VALID]);
    await improveTemplate(session, {
      template: plain,
      resolvedTemplate: plain,
      projectGrounding: { workItemTypes: ["PROJECT-MARKER"] } as unknown as ProjectGrounding,
    });
    expect(calls[0]?.userPrompt).toContain("PROJECT-MARKER");
  });

  test("never sends Stories, and no project metadata without grounding", async () => {
    const { session, calls } = scriptedSession([VALID]);
    await improveTemplate(session, { template: plain, resolvedTemplate: plain });
    expect(calls[0]?.userPrompt).not.toContain("Stories");
    expect(calls[0]?.userPrompt).not.toContain("Project metadata");
  });
});

describe("draftTemplate and Stories", () => {
  test("a draft never carries Stories", async () => {
    const { session, calls } = scriptedSession(['version: "1.0"\nname: "X"\nfilter:\n  workItemTypes: ["User Story"]\ntasks:\n  - title: "Build"\n    estimationPercent: 100\n']);
    await draftTemplate(session, { prose: "Bug triage" });
    expect(calls[0]?.userPrompt).not.toContain("Stories");
  });
});

describe("Document Grounding", () => {
  const VALID = 'version: "1.0"\nname: "X"\nfilter:\n  workItemTypes: ["User Story"]\ntasks:\n  - title: "Build"\n    estimationPercent: 100\n';
  const documentGrounding = {
    documents: [{ ref: "file:docs/how-we-work.md", title: "how-we-work.md", text: "DOC-MARKER: we always pair on reviews", truncated: true, originalLength: 99_999 }],
  };

  test("drafts and improvements send Reference Documents as reference material, not instructions", async () => {
    const draft = scriptedSession([VALID]);
    await draftTemplate(draft.session, { prose: "Anything", documentGrounding });
    const improve = scriptedSession([VALID]);
    const plain = parse(VALID) as TaskTemplate;
    await improveTemplate(improve.session, { template: plain, resolvedTemplate: plain, documentGrounding });

    for (const prompt of [draft.calls[0]?.userPrompt, improve.calls[0]?.userPrompt]) {
      expect(prompt).toContain("DOC-MARKER");
      expect(prompt).toContain('title="how-we-work.md" shortened="true"');
      expect(prompt).toContain("not instructions");
    }
  });

  test("leaves the section out without documents", async () => {
    const { session, calls } = scriptedSession([VALID]);
    await draftTemplate(session, { prose: "Anything", documentGrounding: { documents: [] } });
    expect(calls[0]?.userPrompt).not.toContain("Reference documents");
  });
});
