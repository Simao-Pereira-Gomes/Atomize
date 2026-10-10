import type { TaskTemplate } from "@sppg2001/atomize-schema";
import { describe, expect, it } from "vitest";
import { SidecarRequestError } from "../../sidecar/sidecar-client";
import { toCatalogClone } from "../../starting-paths/catalog-clone";
import { createAuthoringStore } from "../../stores/sections";
import { createImproveSession, type ImproveChoices, type ImproveGrounding, parseImproveResponse } from "../improve-session";

const CURRENT: TaskTemplate = {
  version: "1.0",
  name: "Backend API",
  filter: { workItemTypes: ["User Story"] },
  tasks: [{ title: "Build", estimationPercent: 100 }],
} as TaskTemplate;

const PROPOSAL = {
  template: { ...CURRENT, tasks: [{ title: "Build", estimationPercent: 80 }, { title: "Review", estimationPercent: 20 }] },
  notes: ["Added a review task."],
};

function session(options: {
  respond?: () => Promise<unknown>;
  store?: ReturnType<typeof createAuthoringStore>;
  loadGrounding?: (choices: ImproveChoices) => Promise<ImproveGrounding>;
  defaultProfile?: string;
} = {}) {
  const store = options.store ?? createAuthoringStore();
  if (!options.store) store.loadTemplate(CURRENT);
  const requests: { id: string; template: TaskTemplate; guidance: string; grounding?: ImproveGrounding }[] = [];
  const cancelled: string[] = [];
  const improve = createImproveSession({
    current: () => store.toTemplate(),
    apply: (template) => store.loadTemplate(template),
    improve: async (id, template, guidance, grounding) => {
      requests.push({ id, template, guidance, grounding });
      return options.respond ? options.respond() : PROPOSAL;
    },
    cancel: async (id) => { cancelled.push(id); },
    createId: () => `improve-${requests.length + 1}`,
    ...(options.loadGrounding ? { loadGrounding: options.loadGrounding } : {}),
    ...(options.defaultProfile ? { defaultProfile: () => options.defaultProfile as string } : {}),
  });
  return { improve, store, requests, cancelled };
}

describe("Improve with AI", () => {
  it("sends the open Template and the guidance, then shows the proposal for review without changing anything", async () => {
    const { improve, store, requests } = session();
    improve.open();
    improve.setGuidance("Add reviews");
    await improve.start();

    expect(requests[0]?.guidance).toBe("Add reviews");
    expect(requests[0]?.template.name).toBe("Backend API");
    const state = improve.state();
    expect(state.phase).toBe("review");
    if (state.phase !== "review") return;
    expect(state.proposal.tasks.map((task) => task.title)).toEqual(["Build", "Review"]);
    expect(state.notes).toEqual(["Added a review task."]);
    expect(store.tasks.fields.items).toHaveLength(1);
  });

  it("Accept replaces the authoring state with the proposal", async () => {
    const { improve, store } = session();
    improve.open();
    await improve.start();
    improve.accept();

    expect(improve.state().phase).toBe("closed");
    expect(store.toTemplate().tasks.map((task) => task.title)).toEqual(["Build", "Review"]);
  });

  it("Reject leaves the authoring state exactly as it was", async () => {
    const { improve, store } = session();
    const before = store.serialise();
    improve.open();
    await improve.start();
    improve.reject();

    expect(improve.state().phase).toBe("closed");
    expect(store.serialise()).toBe(before);
  });

  it("works on a Template from any Starting Path once it is complete", async () => {
    const clone = createAuthoringStore();
    clone.loadTemplate(toCatalogClone({ kind: "template", name: "x", ref: "template:x", scope: "builtin", path: "/x.yaml", content: CURRENT } as never));
    const opened = createAuthoringStore();
    opened.loadTemplate(CURRENT);
    const aiDraft = createAuthoringStore();
    aiDraft.loadTemplate({ ...CURRENT, name: "From an AI draft" });

    for (const store of [clone, opened, aiDraft]) {
      const { improve, requests } = session({ store });
      improve.open();
      await improve.start();
      expect(requests).toHaveLength(1);
      expect(improve.state().phase).toBe("review");
    }
  });

  it("asks for an unfinished Template to be completed first, without calling Copilot", async () => {
    const { improve, requests } = session({ store: createAuthoringStore() });
    improve.open();
    improve.setGuidance("Anything");
    await improve.start();

    expect(requests).toHaveLength(0);
    const state = improve.state();
    expect(state.phase).toBe("form");
    if (state.phase === "form") {
      expect(state.error).toContain("Finish the highlighted sections first");
      expect(state.choices.guidance).toBe("Anything");
    }
  });

  it("cancelling stops the request, returns to the form, and ignores a late result", async () => {
    let finish!: (value: unknown) => void;
    const { improve, store, cancelled } = session({ respond: () => new Promise((resolve) => { finish = resolve; }) });
    improve.open();
    improve.setGuidance("Keep this");
    const running = improve.start();
    await improve.cancel();
    finish(PROPOSAL);
    await running;

    expect(cancelled).toEqual(["improve-1"]);
    expect(improve.state()).toMatchObject({ phase: "form", choices: { guidance: "Keep this" } });
    expect(store.tasks.fields.items).toHaveLength(1);
  });

  it("asks the user to sign in when Copilot isn't signed in", async () => {
    const { improve } = session({ respond: async () => { throw new SidecarRequestError("COPILOT_AUTH_REQUIRED", "Sign in"); } });
    improve.open();
    await improve.start();
    expect(improve.state().phase).toBe("auth-error");
  });

  it("returns to the form with the error, keeping the guidance, when Copilot fails", async () => {
    const { improve } = session({ respond: async () => { throw new SidecarRequestError("AI_DRAFT_MALFORMED", "No usable proposal."); } });
    improve.open();
    improve.setGuidance("Tighten estimates");
    await improve.start();
    expect(improve.state()).toMatchObject({ phase: "form", choices: { guidance: "Tighten estimates" }, error: "No usable proposal." });
  });
});

describe("Improve with AI grounding", () => {
  const story = { id: "42", title: "Login", type: "User Story", state: "Done", taskCount: 3 };

  it("starts on the Work Project selected in Global Settings, and sends its metadata and the chosen Stories", async () => {
    const loaded: ImproveChoices[] = [];
    const { improve, requests } = session({
      defaultProfile: "work",
      loadGrounding: async (choices) => { loaded.push(choices); return { project: { workItemTypes: ["User Story"] }, stories: { stories: [] } }; },
    });
    improve.open();
    expect(improve.choices().profile).toBe("work");
    improve.setStories([story]);
    improve.setIncludeSensitive(true);
    await improve.start();

    expect(loaded[0]).toMatchObject({ profile: "work", stories: [story], includeSensitive: true });
    expect(requests[0]?.grounding).toEqual({ project: { workItemTypes: ["User Story"] }, stories: { stories: [] } });
  });

  it("loads no grounding without a Work Project", async () => {
    let called = false;
    const { improve, requests } = session({ loadGrounding: async () => { called = true; return {}; } });
    improve.open();
    await improve.start();
    expect(called).toBe(false);
    expect(requests[0]?.grounding).toBeUndefined();
  });

  it("stops on a grounding failure, then continues without grounding only when asked", async () => {
    const { improve, requests } = session({ defaultProfile: "work", loadGrounding: async () => { throw new Error("Story 7 has no Tasks."); } });
    improve.open();
    await improve.start();
    expect(improve.state()).toMatchObject({ phase: "grounding-error", message: "Story 7 has no Tasks." });
    expect(requests).toHaveLength(0);

    await improve.start({ ungrounded: true });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.grounding).toBeUndefined();
    expect(improve.state().phase).toBe("review");
  });

  it("clears the chosen Stories and the sensitive opt-in when the Work Project changes", () => {
    const { improve } = session({ defaultProfile: "work" });
    improve.open();
    improve.setStories([story]);
    improve.setIncludeSensitive(true);
    improve.setProfile("other");
    expect(improve.choices()).toMatchObject({ profile: "other", stories: [], includeSensitive: false });
  });
});

describe("parseImproveResponse", () => {
  it("keeps a proposal Copilot couldn't fully fix, with its problems, so it stays editable", () => {
    const parsed = parseImproveResponse({ template: { ...CURRENT, tasks: [{ title: "", estimationPercent: 120 }] }, notes: [], errors: ["tasks.0.title: Required"] });
    expect(parsed.problems).toEqual(["tasks.0.title: Required"]);
    expect(parsed.template.tasks[0]?.title).toBe("");
  });

  it("rejects a response without a Template", () => {
    expect(() => parseImproveResponse({ notes: [] })).toThrow("did not contain a Template");
  });
});
