import { describe, expect, it } from "bun:test";
import { handleLine, type SidecarServices } from "./protocol";

const services: SidecarServices = {
  library: { getCatalog: async () => ({ items: [], overrides: [], lineage: [] }) },
  fetchGrounding: async () => ({}),
  createDraftSession: async () => ({ generate: async () => "", abort: async () => {}, dispose: async () => {} }),
  drafts: new Map(),
  cancelledDrafts: new Set(),
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

  it("retries malformed output no more than three times", async () => {
    let calls = 0;
    const ai: SidecarServices = { ...services, drafts: new Map(), cancelledDrafts: new Set(), createDraftSession: async () => ({ generate: async () => { calls += 1; return "not a template"; }, abort: async () => {}, dispose: async () => {} }) };
    await expect(handleLine('{"jsonrpc":"2.0","id":11,"method":"ai.generate","params":{"draftId":"draft-2","prose":"Build something"}}', ai)).resolves.toMatchObject({ error: { code: "AI_DRAFT_MALFORMED" } });
    expect(calls).toBe(3);
  });
});
