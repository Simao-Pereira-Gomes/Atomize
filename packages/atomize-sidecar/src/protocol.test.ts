import { describe, expect, it } from "bun:test";
import { handleLine, type SidecarServices } from "./protocol";

const services: SidecarServices = {
  library: {
    getCatalogAll: async () => ({ items: [], overrides: [], lineage: [] }),
    getRunnableTemplate: async () => {
      throw new Error("getRunnableTemplate not stubbed for this test");
    },
    removeCatalogItem: async () => {
      throw new Error("removeCatalogItem not stubbed for this test");
    },
    installTemplate: async () => {
      throw new Error("installTemplate not stubbed for this test");
    },
  },
  fetchGrounding: async () => ({}),
  validateOnline: async () => ({ valid: true, errors: [], warnings: [], mode: "lenient", requirements: { customFieldTaskCount: 0, conditionFieldRefs: [], hasSavedQuery: false, needsOnlineVerification: false } }),
  queryGenerateStories: async () => ({ stories: [] }),
  runGenerate: async () => {
    throw new Error("runGenerate not stubbed for this test");
  },
  createDraftSession: async () => ({ generate: async () => "", abort: async () => {}, dispose: async () => {} }),
  drafts: new Map(),
  cancelledDrafts: new Set(),
  activeRequests: new Map(),
  notify: () => {},
};

describe("sidecar protocol", () => {
  it("serializes a catalog.list result", async () => {
    await expect(handleLine('{"jsonrpc":"2.0","id":7,"method":"catalog.list"}', services)).resolves.toEqual({ jsonrpc: "2.0", id: 7, result: [] });
  });
  it("serializes malformed input as a parse error", async () => {
    await expect(handleLine("not json", services)).resolves.toEqual({ jsonrpc: "2.0", id: 0, error: { code: "PARSE_ERROR", message: "Request is not valid JSON." } });
  });
  it("serializes unknown methods", async () => {
    await expect(handleLine('{"jsonrpc":"2.0","id":9,"method":"nope"}', services)).resolves.toEqual({ jsonrpc: "2.0", id: 9, error: { code: "METHOD_NOT_FOUND", message: "Unknown method: nope" } });
  });
  it("injects a resolved connection into grounding without returning its token", async () => {
    let received: unknown;
    const grounding: SidecarServices = { ...services, fetchGrounding: async connection => { received = connection; return { workItemTypes: ["Task"] }; } };
    await expect(handleLine('{"jsonrpc":"2.0","id":3,"method":"grounding.fetch","params":{"organizationUrl":"https://dev.azure.com/org","project":"P","team":"T","token":"secret"}}', grounding)).resolves.toEqual({ jsonrpc: "2.0", id: 3, result: { workItemTypes: ["Task"] } });
    expect(received).toEqual({ organizationUrl: "https://dev.azure.com/org", project: "P", team: "T", token: "secret" });
  });
});

describe("validation.online", () => {
  it("passes the in-memory Template and resolved connection to Online Validation", async () => {
    let received: unknown;
    const validating: SidecarServices = {
      ...services,
      validateOnline: async (params) => {
        received = params;
        return { valid: true, errors: [], warnings: [], mode: "lenient", requirements: { customFieldTaskCount: 0, conditionFieldRefs: [], hasSavedQuery: false, needsOnlineVerification: false } };
      },
    };
    const template = makeTemplate();
    await expect(handleLine(JSON.stringify({ jsonrpc: "2.0", id: 70, method: "validation.online", params: { template, connection: { organizationUrl: "https://dev.azure.com/org", project: "P", team: "T", token: "secret" } } }), validating))
      .resolves.toMatchObject({ jsonrpc: "2.0", id: 70, result: { valid: true } });
    expect(received).toEqual({ template, connection: { organizationUrl: "https://dev.azure.com/org", project: "P", team: "T", token: "secret" } });
  });

  it("cancels an in-flight correlated request without emitting a late response", async () => {
    let started!: () => void;
    const validating: SidecarServices = {
      ...services,
      activeRequests: new Map(),
      validateOnline: async (_params, signal) => await new Promise<never>((resolve, reject) => {
        started = () => resolve(undefined as never);
        signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { code: "REQUEST_CANCELLED" })));
      }) as never,
    };
    const pending = handleLine(JSON.stringify({ jsonrpc: "2.0", id: 71, method: "validation.online", params: { template: makeTemplate(), connection: { organizationUrl: "https://dev.azure.com/org", project: "P", team: "T", token: "secret" } } }), validating);
    while (!validating.activeRequests.has(71)) await new Promise(resolve => setTimeout(resolve, 0));
    await expect(handleLine('{"jsonrpc":"2.0","method":"$/cancelRequest","params":{"id":71}}', validating)).resolves.toBeUndefined();
    started();
    await expect(pending).resolves.toBeUndefined();
  });
});

describe("catalog.remove", () => {
  it("removes a Catalog item and reports success", async () => {
    let received: unknown;
    const removing: SidecarServices = {
      ...services,
      library: { ...services.library, removeCatalogItem: async (kind, name) => { received = { kind, name }; return { kind, scope: "user", name, displayName: name, description: "", ref: `${kind}:${name}`, path: "/tmp/x" }; } },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":30,"method":"catalog.remove","params":{"kind":"template","name":"delivery"}}', removing))
      .resolves.toEqual({ jsonrpc: "2.0", id: 30, result: { removed: true } });
    expect(received).toEqual({ kind: "template", name: "delivery" });
  });

  it("rejects a request missing kind or name", async () => {
    await expect(handleLine('{"jsonrpc":"2.0","id":31,"method":"catalog.remove","params":{"kind":"template"}}', services))
      .resolves.toEqual({ jsonrpc: "2.0", id: 31, error: { code: "INVALID_PARAMS", message: "Removing a Catalog item requires its kind and name." } });
  });

  it("rejects an unrecognized kind", async () => {
    await expect(handleLine('{"jsonrpc":"2.0","id":32,"method":"catalog.remove","params":{"kind":"platform","name":"delivery"}}', services))
      .resolves.toEqual({ jsonrpc: "2.0", id: 32, error: { code: "INVALID_PARAMS", message: "Removing a Catalog item requires its kind and name." } });
  });

  it("propagates a structured error from the catalog without string-scraping it", async () => {
    const notUserScoped: SidecarServices = {
      ...services,
      library: { ...services.library, removeCatalogItem: async () => { throw Object.assign(new Error('Cannot remove "delivery" — it is a project template and is not user-installed.'), { code: "CATALOG_ITEM_NOT_USER_SCOPED" }); } },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":33,"method":"catalog.remove","params":{"kind":"template","name":"delivery"}}', notUserScoped))
      .resolves.toEqual({ jsonrpc: "2.0", id: 33, error: { code: "CATALOG_ITEM_NOT_USER_SCOPED", message: 'Cannot remove "delivery" — it is a project template and is not user-installed.' } });
  });
});

describe("catalog.install", () => {
  it("installs a Catalog item from in-memory content and reports the created item", async () => {
    let received: unknown;
    const installing: SidecarServices = {
      ...services,
      library: {
        ...services.library,
        installTemplate: async (input) => {
          received = input;
          return { kind: "template", scope: "user", name: "delivery", displayName: "Delivery", description: "", ref: "template:delivery", path: "/tmp/delivery.atomize.yaml" };
        },
      },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":40,"method":"catalog.install","params":{"content":"name: Delivery","name":"delivery","scope":"user"}}', installing))
      .resolves.toEqual({ jsonrpc: "2.0", id: 40, result: { kind: "template", scope: "user", name: "delivery", displayName: "Delivery", description: "", ref: "template:delivery", path: "/tmp/delivery.atomize.yaml" } });
    expect(received).toEqual({ source: { content: "name: Delivery", name: "delivery" }, scope: "user", overwrite: false });
  });

  it("passes overwrite through when set", async () => {
    let received: unknown;
    const installing: SidecarServices = {
      ...services,
      library: {
        ...services.library,
        installTemplate: async (input) => { received = input; return { kind: "template", scope: "project", name: "delivery", displayName: "Delivery", description: "", ref: "template:delivery", path: "/tmp/delivery.atomize.yaml" }; },
      },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":41,"method":"catalog.install","params":{"content":"name: Delivery","name":"delivery","scope":"project","overwrite":true}}', installing))
      .resolves.toEqual({ jsonrpc: "2.0", id: 41, result: { kind: "template", scope: "project", name: "delivery", displayName: "Delivery", description: "", ref: "template:delivery", path: "/tmp/delivery.atomize.yaml" } });
    expect(received).toEqual({ source: { content: "name: Delivery", name: "delivery" }, scope: "project", overwrite: true });
  });

  it("rejects a request missing content, name, or scope", async () => {
    await expect(handleLine('{"jsonrpc":"2.0","id":42,"method":"catalog.install","params":{"content":"name: Delivery","name":"delivery"}}', services))
      .resolves.toEqual({ jsonrpc: "2.0", id: 42, error: { code: "INVALID_PARAMS", message: "Installing a Catalog item requires its content, name, and scope." } });
  });

  it("propagates a structured collision error without string-scraping it", async () => {
    const colliding: SidecarServices = {
      ...services,
      library: { ...services.library, installTemplate: async () => { throw Object.assign(new Error('A template named "delivery" already exists.'), { code: "CATALOG_ITEM_ALREADY_EXISTS" }); } },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":43,"method":"catalog.install","params":{"content":"name: Delivery","name":"delivery","scope":"user"}}', colliding))
      .resolves.toEqual({ jsonrpc: "2.0", id: 43, error: { code: "CATALOG_ITEM_ALREADY_EXISTS", message: 'A template named "delivery" already exists.' } });
  });
});

describe("template.resolveLocal", () => {
  it("resolves a local file's composed template with validation disabled", async () => {
    let received: unknown;
    const runnable: SidecarServices = {
      ...services,
      library: {
        ...services.library,
        getRunnableTemplate: async (source, options) => {
          received = { source, options };
          return { template: { name: "Composed" }, meta: {}, source: { kind: "file", input: source }, validation: { valid: true, errors: [] } } as never;
        },
      },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":20,"method":"template.resolveLocal","params":{"path":"/tmp/child.atomize.yaml"}}', runnable))
      .resolves.toEqual({ jsonrpc: "2.0", id: 20, result: { name: "Composed" } });
    expect(received).toEqual({ source: "/tmp/child.atomize.yaml", options: { validate: false } });
  });

  it("rejects a request missing a path", async () => {
    await expect(handleLine('{"jsonrpc":"2.0","id":21,"method":"template.resolveLocal","params":{}}', services))
      .resolves.toEqual({ jsonrpc: "2.0", id: 21, error: { code: "INVALID_PARAMS", message: "Resolving a local template requires a file path." } });
  });

  it("wraps a resolution failure as TEMPLATE_RESOLUTION_FAILED", async () => {
    const failing: SidecarServices = {
      ...services,
      library: {
        ...services.library,
        getRunnableTemplate: async () => { throw new Error('template "base" not found.'); },
      },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":22,"method":"template.resolveLocal","params":{"path":"/tmp/child.atomize.yaml"}}', failing))
      .resolves.toEqual({ jsonrpc: "2.0", id: 22, error: { code: "TEMPLATE_RESOLUTION_FAILED", message: 'Atomize Studio could not resolve this template\'s extends/mixins: template "base" not found.' } });
  });
});

function makeTemplate(overrides: Record<string, unknown> = {}): unknown {
  return {
    version: "1.0",
    name: "Test Template",
    filter: {},
    tasks: [
      { title: "Task A", estimationPercent: 60 },
      { title: "Task B", estimationPercent: 40 },
    ],
    ...overrides,
  };
}

const connection = { organizationUrl: "https://dev.azure.com/org", project: "P", team: "T", token: "secret" };

describe("generate.queryStories", () => {
  it("passes the Preview Source and resolved connection to the injected service, returning its Stories", async () => {
    let received: unknown;
    const generating: SidecarServices = {
      ...services,
      queryGenerateStories: async (params) => { received = params; return { stories: [{ id: "1031", title: "Add OAuth login" } as never] }; },
    };
    await expect(handleLine(JSON.stringify({ jsonrpc: "2.0", id: 80, method: "generate.queryStories", params: { source: "template:release-checklist", connection } }), generating))
      .resolves.toEqual({ jsonrpc: "2.0", id: 80, result: { stories: [{ id: "1031", title: "Add OAuth login" }] } });
    expect(received).toEqual({ source: "template:release-checklist", connection });
  });

  it("rejects a missing source as INVALID_PARAMS", async () => {
    await expect(handleLine(JSON.stringify({ jsonrpc: "2.0", id: 81, method: "generate.queryStories", params: { connection } }), services))
      .resolves.toMatchObject({ jsonrpc: "2.0", id: 81, error: { code: "INVALID_PARAMS" } });
  });
});

describe("generate.run", () => {
  it("passes runId, source, connection, dryRun, and scope to the injected service", async () => {
    let received: unknown;
    const generating: SidecarServices = {
      ...services,
      runGenerate: async (params) => { received = params; return { report: { templateName: "Release Checklist", storiesProcessed: 1, storiesSuccess: 1, storiesFailed: 0, tasksCalculated: 2, tasksCreated: 2, tasksSkipped: 0, results: [], errors: [], warnings: [], executionTime: 0, dryRun: true } as never }; },
    };
    const params = { runId: "run-1", source: "template:release-checklist", connection, dryRun: true, scope: { kind: "stories", storyIds: ["1031"] } };
    await expect(handleLine(JSON.stringify({ jsonrpc: "2.0", id: 90, method: "generate.run", params }), generating))
      .resolves.toMatchObject({ jsonrpc: "2.0", id: 90, result: { report: { storiesProcessed: 1 } } });
    expect(received).toEqual({ ...params, continueOnError: false });
  });

  it("accepts a filter scope with no storyIds", async () => {
    let received: unknown;
    const generating: SidecarServices = {
      ...services,
      runGenerate: async (params) => { received = params; return { report: {} as never }; },
    };
    const params = { runId: "run-2", source: "template:release-checklist", connection, dryRun: false, scope: { kind: "filter" } };
    await handleLine(JSON.stringify({ jsonrpc: "2.0", id: 91, method: "generate.run", params }), generating);
    expect(received).toEqual({ ...params, continueOnError: false });
  });

  it("rejects a missing dryRun flag as INVALID_PARAMS", async () => {
    const params = { runId: "run-3", source: "template:release-checklist", connection, scope: { kind: "filter" } };
    await expect(handleLine(JSON.stringify({ jsonrpc: "2.0", id: 92, method: "generate.run", params }), services))
      .resolves.toMatchObject({ jsonrpc: "2.0", id: 92, error: { code: "INVALID_PARAMS" } });
  });

  it("rejects a stories scope with an empty storyIds array as INVALID_PARAMS", async () => {
    const params = { runId: "run-4", source: "template:release-checklist", connection, dryRun: true, scope: { kind: "stories", storyIds: [] } };
    await expect(handleLine(JSON.stringify({ jsonrpc: "2.0", id: 93, method: "generate.run", params }), services))
      .resolves.toMatchObject({ jsonrpc: "2.0", id: 93, error: { code: "INVALID_PARAMS" } });
  });

  it("cancels an in-flight run without emitting a late response — mirrors validation.online's cancellation", async () => {
    let started!: () => void;
    const generating: SidecarServices = {
      ...services,
      activeRequests: new Map(),
      runGenerate: (_params, signal) => new Promise<never>((resolve, reject) => {
        started = () => resolve(undefined as never);
        signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { code: "REQUEST_CANCELLED" })));
      }),
    };
    const params = { runId: "run-5", source: "template:release-checklist", connection, dryRun: false, scope: { kind: "filter" } };
    const pending = handleLine(JSON.stringify({ jsonrpc: "2.0", id: 94, method: "generate.run", params }), generating);
    while (!generating.activeRequests.has(94)) await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(handleLine('{"jsonrpc":"2.0","method":"$/cancelRequest","params":{"id":94}}', generating)).resolves.toBeUndefined();
    started();
    await expect(pending).resolves.toBeUndefined();
  });
});

describe("preview.inspect", () => {
  it("resolves the source with validation disabled and inspects the result", async () => {
    let received: unknown;
    const inspecting: SidecarServices = {
      ...services,
      library: {
        ...services.library,
        getRunnableTemplate: async (source, options) => {
          received = { source, options };
          return { template: makeTemplate(), meta: {}, source: { kind: "file", input: source }, validation: { valid: true, errors: [] } } as never;
        },
      },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":50,"method":"preview.inspect","params":{"source":"template:delivery"}}', inspecting))
      .resolves.toEqual({ jsonrpc: "2.0", id: 50, result: { fields: [{ name: "estimation", type: "number", sources: ["estimation"], required: true }] } });
    expect(received).toEqual({ source: "template:delivery", options: { validate: false } });
  });

  it("rejects a request missing a source", async () => {
    await expect(handleLine('{"jsonrpc":"2.0","id":51,"method":"preview.inspect","params":{}}', services))
      .resolves.toEqual({ jsonrpc: "2.0", id: 51, error: { code: "INVALID_PARAMS", message: "Inspecting a Template requires its source." } });
  });

  it("wraps a resolution failure as TEMPLATE_RESOLUTION_FAILED", async () => {
    const failing: SidecarServices = {
      ...services,
      library: { ...services.library, getRunnableTemplate: async () => { throw new Error("template not found."); } },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":52,"method":"preview.inspect","params":{"source":"template:missing"}}', failing))
      .resolves.toEqual({ jsonrpc: "2.0", id: 52, error: { code: "TEMPLATE_RESOLUTION_FAILED", message: "Atomize Studio could not resolve this Template: template not found." } });
  });
});

describe("preview.mockStory", () => {
  it("resolves the source with validation disabled and previews against the mock Story", async () => {
    const previewing: SidecarServices = {
      ...services,
      library: { ...services.library, getRunnableTemplate: async () => ({ template: makeTemplate(), meta: {}, source: { kind: "file", input: "" }, validation: { valid: true, errors: [] } }) as never },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":53,"method":"preview.mockStory","params":{"source":"/tmp/delivery.atomize.yaml","mockStory":"{\\"estimation\\":10}"}}', previewing))
      .resolves.toEqual({
        jsonrpc: "2.0", id: 53, result: {
          tasks: [
            { title: "Task A", estimation: 6, estimationPercent: 60 },
            { title: "Task B", estimation: 4, estimationPercent: 40 },
          ],
          skippedTasks: [],
          estimationSummary: { storyEstimation: 10, totalTaskEstimation: 10, percentageUsed: 100 },
        },
      });
  });

  it("rejects a request missing source or mockStory", async () => {
    await expect(handleLine('{"jsonrpc":"2.0","id":54,"method":"preview.mockStory","params":{"source":"template:delivery"}}', services))
      .resolves.toEqual({ jsonrpc: "2.0", id: 54, error: { code: "INVALID_PARAMS", message: "Previewing a Template requires its source and mock Story values." } });
  });

  it("wraps malformed mock Story JSON as MOCK_STORY_INVALID without resolving the source", async () => {
    let resolved = false;
    const untouched: SidecarServices = {
      ...services,
      library: { ...services.library, getRunnableTemplate: async () => { resolved = true; return { template: makeTemplate(), meta: {}, source: { kind: "file", input: "" }, validation: { valid: true, errors: [] } } as never; } },
    };
    const response = await handleLine('{"jsonrpc":"2.0","id":55,"method":"preview.mockStory","params":{"source":"template:delivery","mockStory":"not json"}}', untouched);
    expect(response).toMatchObject({ jsonrpc: "2.0", id: 55, error: { code: "MOCK_STORY_INVALID" } });
    expect((response as { error: { message: string } }).error.message).toContain("Invalid mock story JSON");
    expect(resolved).toBe(false);
  });

  it("wraps a resolution failure as TEMPLATE_RESOLUTION_FAILED", async () => {
    const failing: SidecarServices = {
      ...services,
      library: { ...services.library, getRunnableTemplate: async () => { throw new Error("template not found."); } },
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":56,"method":"preview.mockStory","params":{"source":"template:missing","mockStory":"{}"}}', failing))
      .resolves.toEqual({ jsonrpc: "2.0", id: 56, error: { code: "TEMPLATE_RESOLUTION_FAILED", message: "Atomize Studio could not resolve this Template: template not found." } });
  });
});

describe("AI draft protocol", () => {
  it("rejects a late generation result after cancellation and waits for abort acknowledgement", async () => {
    let resolveGeneration!: (value: string) => void;
    let aborted = false;
    const ai: SidecarServices = {
      ...services,
      drafts: new Map(),
      cancelledDrafts: new Set(),
      createDraftSession: async () => ({
        generate: async () => await new Promise<string>((resolve) => { resolveGeneration = resolve; }),
        abort: async () => { aborted = true; }, dispose: async () => {},
      }),
    };
    const generation = handleLine('{"jsonrpc":"2.0","id":12,"method":"ai.generate","params":{"draftId":"draft-cancel","prose":"Build something"}}', ai);
    while (!ai.drafts.has("draft-cancel")) await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(handleLine('{"jsonrpc":"2.0","id":13,"method":"ai.cancel","params":{"draftId":"draft-cancel"}}', ai)).resolves.toEqual({ jsonrpc: "2.0", id: 13, result: { cancelled: true } });
    expect(aborted).toBe(true);
    resolveGeneration("version: '1.0'\nname: Late\nfilter: {}\ntasks: []");
    await expect(generation).resolves.toMatchObject({ error: { code: "AI_DRAFT_CANCELLED" } });
  });

  it("returns a minimally-shaped raw Template without strict field validation", async () => {
    let disposed = false;
    const ai: SidecarServices = {
      ...services,
      drafts: new Map(),
      createDraftSession: async () => ({
        generate: async () => "version: '1.0'\nname: Draft\nfilter: {}\ntasks:\n  - title: ''\n    estimationPercent: 120\n",
        abort: async () => {}, dispose: async () => { disposed = true; },
      }),
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":10,"method":"ai.generate","params":{"draftId":"draft-1","prose":"Build something"}}', ai)).resolves.toEqual({ jsonrpc: "2.0", id: 10, result: { template: { version: "1.0", name: "Draft", filter: {}, tasks: [{ title: "", estimationPercent: 120 }] } } });
    expect(disposed).toBe(true);
  });

  it("streams the first attempt through session.stream and notifies progress by accumulated length", async () => {
    const notifications: unknown[] = [];
    const template = "version: '1.0'\nname: Draft\nfilter: {}\ntasks: []";
    const chunks = [template.slice(0, 10), template.slice(10)];
    const ai: SidecarServices = {
      ...services,
      drafts: new Map(),
      cancelledDrafts: new Set(),
      notify: (notification) => notifications.push(notification),
      createDraftSession: async () => ({
        generate: async () => { throw new Error("generate() should not be called when stream() is available"); },
        stream: async function* () { for (const chunk of chunks) yield chunk; },
        abort: async () => {}, dispose: async () => {},
      }),
    };
    await expect(handleLine('{"jsonrpc":"2.0","id":14,"method":"ai.generate","params":{"draftId":"draft-stream","prose":"Build something"}}', ai))
      .resolves.toEqual({ jsonrpc: "2.0", id: 14, result: { template: { version: "1.0", name: "Draft", filter: {}, tasks: [] } } });
    expect(notifications).toEqual([
      { jsonrpc: "2.0", method: "ai.progress", params: { draftId: "draft-stream", length: chunks[0]!.length } },
      { jsonrpc: "2.0", method: "ai.progress", params: { draftId: "draft-stream", length: template.length } },
    ]);
  });

  it("retries malformed output no more than three times", async () => {
    let calls = 0;
    const ai: SidecarServices = { ...services, drafts: new Map(), cancelledDrafts: new Set(), createDraftSession: async () => ({ generate: async () => { calls += 1; return "not a template"; }, abort: async () => {}, dispose: async () => {} }) };
    await expect(handleLine('{"jsonrpc":"2.0","id":11,"method":"ai.generate","params":{"draftId":"draft-2","prose":"Build something"}}', ai)).resolves.toMatchObject({ error: { code: "AI_DRAFT_MALFORMED" } });
    expect(calls).toBe(3);
  });
});
