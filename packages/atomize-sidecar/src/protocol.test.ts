import { describe, expect, it } from "bun:test";
import { handleLine, type SidecarServices } from "./protocol";

const services: SidecarServices = { library: { getCatalog: async () => ({ items: [] }) }, fetchGrounding: async () => ({}) };

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
