import { buildAzureDevOpsConfig, PlatformFactory, TemplateLibrary } from "@sppg2001/atomize-core";
import { TemplateCatalog } from "@sppg2001/atomize-core/services/template/template-catalog";
import { requireProjectMetadataReader, requireSavedQueryReader } from "@sppg2001/atomize-core/platforms/capabilities";
import { AuthError, getErrorMessage } from "@sppg2001/atomize-core/utils/errors";
import { readFile } from "node:fs/promises";
import { match } from "ts-pattern";
import { parse as parseYaml } from "yaml";

export type RpcRequest = { jsonrpc: "2.0"; id: number; method: string; params?: unknown };
export type RpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code: string; message: string } };
export type RpcNotification = { jsonrpc: "2.0"; method: "sidecar.ready" };
export type CatalogLibrary = Pick<TemplateLibrary, "getCatalog">;
export type GroundingConnection = { organizationUrl: string; project: string; team: string; token: string };
export type SidecarServices = { library: CatalogLibrary; fetchGrounding: (connection: GroundingConnection) => Promise<unknown> };

export function createTemplateLibrary(): TemplateLibrary {
  // The CI bundle copies atomize-core's catalog beside the sidecar binary.
  const packageRoot = process.env.ATOMIZE_CATALOG_ROOT;
  return new TemplateLibrary(undefined, new TemplateCatalog(packageRoot ? { packageRoot } : undefined));
}

export function createSidecarServices(library = createTemplateLibrary()): SidecarServices {
  return { library, fetchGrounding };
}

export async function fetchGrounding(connection: GroundingConnection): Promise<unknown> {
  try {
    const adapter = PlatformFactory.create("azure-devops", buildAzureDevOpsConfig(connection, connection.token));
    await adapter.authenticate();
    const metadataReader = requireProjectMetadataReader(adapter);
    const queryReader = requireSavedQueryReader(adapter);
    const workItemTypes = await metadataReader.getWorkItemTypes();
    const [states, areaPaths, iterationPaths, teams, savedQueries, taskFields, fieldsByWorkItemType] = await Promise.all([
      Promise.all(workItemTypes.map(async type => [type, await metadataReader.getStatesForWorkItemType(type)] as const)),
      metadataReader.getAreaPaths(), metadataReader.getIterationPaths(), metadataReader.getTeams(), queryReader.listSavedQueries(),
      metadataReader.getFieldSchemas("Task"),
      Promise.all(workItemTypes.map(async type => [type, await metadataReader.getFieldSchemas(type)] as const)),
    ]);
    return { workItemTypes, statesByWorkItemType: Object.fromEntries(states), areaPaths, iterationPaths, teams,
      savedQueries: savedQueries.map(({ id, path }) => ({ id, path })), taskFields, fieldsByWorkItemType: Object.fromEntries(fieldsByWorkItemType) };
  } catch (error) {
    const message = getErrorMessage(error);
    const code = error instanceof AuthError || /authentication failed|access denied/i.test(message)
      ? (/token.*expired|personal access token.*expired/i.test(message) ? "GROUNDING_TOKEN_EXPIRED" : "GROUNDING_AUTH_FAILED")
      : "GROUNDING_FETCH_FAILED";
    throw Object.assign(new Error(code === "GROUNDING_TOKEN_EXPIRED"
      ? "Your Azure DevOps access token has expired. Add a new project connection with a current token, then try again."
      : code === "GROUNDING_AUTH_FAILED"
        ? "Atomize could not sign in to this Azure DevOps project. Check its access token, then try again."
        : "Atomize could not load choices from this Azure DevOps project. Check the connection and try again."), { code });
  }
}

function groundingConnection(params: unknown): GroundingConnection {
  if (typeof params !== "object" || params === null) throw Object.assign(new Error("Grounding requires a resolved connection."), { code: "INVALID_PARAMS" });
  const value = params as Partial<GroundingConnection>;
  if ([value.organizationUrl, value.project, value.team, value.token].some(field => typeof field !== "string" || !field.trim())) {
    throw Object.assign(new Error("Grounding requires a resolved connection."), { code: "INVALID_PARAMS" });
  }
  return value as GroundingConnection;
}

export async function dispatch(request: RpcRequest, services: SidecarServices): Promise<unknown> {
  return await match(request.method)
    .with("catalog.list", async () => {
      const { items } = await services.library.getCatalog("template");
      return await Promise.all(items.map(async item => ({ ...item, template: parseYaml(await readFile(item.path, "utf8")) })));
    })
    .with("grounding.fetch", () => services.fetchGrounding(groundingConnection(request.params)))
    .otherwise(method => { throw Object.assign(new Error(`Unknown method: ${method}`), { code: "METHOD_NOT_FOUND" }); });
}

export async function handleLine(line: string, services: SidecarServices): Promise<RpcResponse | undefined> {
  let value: unknown;
  try { value = JSON.parse(line); } catch { return { jsonrpc: "2.0", id: 0, error: { code: "PARSE_ERROR", message: "Request is not valid JSON." } }; }
  if (!isRequest(value)) return { jsonrpc: "2.0", id: typeof (value as { id?: unknown }).id === "number" ? (value as { id: number }).id : 0, error: { code: "INVALID_REQUEST", message: "Request must include jsonrpc, numeric id, and method." } };
  try { return { jsonrpc: "2.0", id: value.id, result: await dispatch(value, services) }; }
  catch (error) { return { jsonrpc: "2.0", id: value.id, error: { code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "SIDECAR_REQUEST_FAILED", message: error instanceof Error ? error.message : "Sidecar request failed." } }; }
}

function isRequest(value: unknown): value is RpcRequest {
  return typeof value === "object" && value !== null && (value as RpcRequest).jsonrpc === "2.0" && typeof (value as RpcRequest).id === "number" && typeof (value as RpcRequest).method === "string";
}
