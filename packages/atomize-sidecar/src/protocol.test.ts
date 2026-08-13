import { describe, expect, it } from "bun:test";
import { handleLine } from "./protocol";

const library = { getCatalog: async () => ({ items: [] }) };

describe("sidecar protocol", () => {
  it("serializes a catalog.list result", async () => {
    await expect(handleLine('{"jsonrpc":"2.0","id":7,"method":"catalog.list"}', library)).resolves.toEqual({ jsonrpc: "2.0", id: 7, result: [] });
  });
  it("serializes malformed input as a parse error", async () => {
    await expect(handleLine("not json", library)).resolves.toEqual({ jsonrpc: "2.0", id: 0, error: { code: "PARSE_ERROR", message: "Request is not valid JSON." } });
  });
  it("serializes unknown methods", async () => {
    await expect(handleLine('{"jsonrpc":"2.0","id":9,"method":"nope"}', library)).resolves.toEqual({ jsonrpc: "2.0", id: 9, error: { code: "METHOD_NOT_FOUND", message: "Unknown method: nope" } });
  });
});
