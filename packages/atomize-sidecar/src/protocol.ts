import { TemplateLibrary } from "@sppg2001/atomize-core";
import { TemplateCatalog } from "@sppg2001/atomize-core/services/template/template-catalog";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

export type RpcRequest = { jsonrpc: "2.0"; id: number; method: string; params?: unknown };
export type RpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code: string; message: string } };
export type RpcNotification = { jsonrpc: "2.0"; method: "sidecar.ready" };
export type CatalogLibrary = Pick<TemplateLibrary, "getCatalog">;

export function createTemplateLibrary(): TemplateLibrary {
  // The CI bundle copies atomize-core's catalog beside the sidecar binary.
  const packageRoot = process.env.ATOMIZE_CATALOG_ROOT;
  return new TemplateLibrary(undefined, new TemplateCatalog(packageRoot ? { packageRoot } : undefined));
}

export async function dispatch(request: RpcRequest, library: CatalogLibrary): Promise<unknown> {
  if (request.method !== "catalog.list") throw Object.assign(new Error(`Unknown method: ${request.method}`), { code: "METHOD_NOT_FOUND" });
  const { items } = await library.getCatalog("template");
  return await Promise.all(items.map(async item => ({
    ...item,
    template: parseYaml(await readFile(item.path, "utf8")),
  })));
}

export async function handleLine(line: string, library: CatalogLibrary): Promise<RpcResponse | undefined> {
  let value: unknown;
  try { value = JSON.parse(line); } catch { return { jsonrpc: "2.0", id: 0, error: { code: "PARSE_ERROR", message: "Request is not valid JSON." } }; }
  if (!isRequest(value)) return { jsonrpc: "2.0", id: typeof (value as { id?: unknown }).id === "number" ? (value as { id: number }).id : 0, error: { code: "INVALID_REQUEST", message: "Request must include jsonrpc, numeric id, and method." } };
  try { return { jsonrpc: "2.0", id: value.id, result: await dispatch(value, library) }; }
  catch (error) { return { jsonrpc: "2.0", id: value.id, error: { code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "CATALOG_LIST_FAILED", message: error instanceof Error ? error.message : "Catalog request failed." } }; }
}

function isRequest(value: unknown): value is RpcRequest {
  return typeof value === "object" && value !== null && (value as RpcRequest).jsonrpc === "2.0" && typeof (value as RpcRequest).id === "number" && typeof (value as RpcRequest).method === "string";
}
