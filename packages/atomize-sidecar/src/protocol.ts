import { buildAzureDevOpsConfig, PlatformFactory, TemplateLibrary } from "@sppg2001/atomize-core";
import { TemplateCatalog } from "@sppg2001/atomize-core/services/template/template-catalog";
import { requireProjectMetadataReader, requireSavedQueryReader } from "@sppg2001/atomize-core/platforms/capabilities";
import { AuthError, getErrorMessage } from "@sppg2001/atomize-core/utils/errors";
import { readFile } from "node:fs/promises";
import { match } from "ts-pattern";
import { parse as parseYaml } from "yaml";
import { CopilotAuthenticationError, GitHubCopilotProvider, type AIDraftSession } from "@sppg2001/atomize-ai";
import { buildSystemPrompt, buildUserPrompt } from "@sppg2001/atomize-core/services/template/llm-template-generator";

export type RpcRequest = { jsonrpc: "2.0"; id: number; method: string; params?: unknown };
export type RpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code: string; message: string } };
export type RpcNotification =
  | { jsonrpc: "2.0"; method: "sidecar.ready" }
  | { jsonrpc: "2.0"; method: "ai.progress"; params: { draftId: string; length: number } };
export type SidecarTemplateLibrary = Pick<TemplateLibrary, "getCatalog" | "getRunnableTemplate">;
export type GroundingConnection = { organizationUrl: string; project: string; team: string; token: string };
export type AIDraftParams = { draftId: string; prose: string; grounding?: unknown };
export type SidecarServices = {
  library: SidecarTemplateLibrary;
  fetchGrounding: (connection: GroundingConnection) => Promise<unknown>;
  createDraftSession: () => Promise<AIDraftSession>;
  drafts: Map<string, AIDraftSession>;
  cancelledDrafts: Set<string>;
  /** Writes an out-of-band notification (no request id) to the transport, e.g. live AI draft progress. */
  notify: (notification: RpcNotification) => void;
};

export function createTemplateLibrary(): TemplateLibrary {
  // The CI bundle copies atomize-core's catalog beside the sidecar binary.
  const packageRoot = process.env.ATOMIZE_CATALOG_ROOT;
  return new TemplateLibrary(undefined, new TemplateCatalog(packageRoot ? { packageRoot } : undefined));
}

export function createSidecarServices(library = createTemplateLibrary()): SidecarServices {
  const provider = new GitHubCopilotProvider();
  return {
    library,
    fetchGrounding,
    createDraftSession: () => provider.createDraftSession(),
    drafts: new Map(),
    cancelledDrafts: new Set(),
    notify: (notification) => process.stdout.write(`${JSON.stringify(notification)}\n`),
  };
}

function aiDraftParams(params: unknown): AIDraftParams {
  if (typeof params !== "object" || params === null) throw Object.assign(new Error("AI drafting requires a draft id and description."), { code: "INVALID_PARAMS" });
  const value = params as Partial<AIDraftParams>;
  if (typeof value.draftId !== "string" || !value.draftId || typeof value.prose !== "string" || !value.prose.trim()) {
    throw Object.assign(new Error("AI drafting requires a draft id and description."), { code: "INVALID_PARAMS" });
  }
  return value as AIDraftParams;
}

function isRawTemplate(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).version === "string"
    && typeof (value as Record<string, unknown>).name === "string"
    && Array.isArray((value as Record<string, unknown>).tasks)
    && typeof (value as Record<string, unknown>).filter === "object"
    && (value as Record<string, unknown>).filter !== null;
}

function parseRawTemplate(output: string): Record<string, unknown> | undefined {
  try {
    const parsed = parseYaml(output.replace(/^```ya?ml\n?/i, "").replace(/\n?```\s*$/, "").trim());
    return isRawTemplate(parsed) ? parsed : undefined;
  } catch { return undefined; }
}

async function generateDraft(params: AIDraftParams, services: SidecarServices): Promise<{ template: Record<string, unknown> }> {
  if (services.drafts.has(params.draftId)) throw Object.assign(new Error("That AI draft is already running."), { code: "AI_DRAFT_IN_PROGRESS" });
  let session: AIDraftSession;
  try { session = await services.createDraftSession(); }
  catch (error) {
    if (error instanceof CopilotAuthenticationError) throw Object.assign(error, { code: "COPILOT_AUTH_REQUIRED" });
    throw error;
  }
  services.drafts.set(params.draftId, session);
  try {
    const grounding = params.grounding === undefined ? undefined : JSON.stringify(params.grounding);
    let repair: string[] | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(params.prose, grounding, repair);
      // Only the first attempt streams (mirrors the CLI's runGeneration): repairs are
      // rare, and re-subscribing per attempt isn't worth it for progress feedback alone.
      let output: string;
      if (attempt === 0 && session.stream) {
        output = "";
        for await (const chunk of session.stream(systemPrompt, userPrompt)) {
          output += chunk;
          services.notify({ jsonrpc: "2.0", method: "ai.progress", params: { draftId: params.draftId, length: output.length } });
        }
      } else {
        output = await session.generate(systemPrompt, userPrompt);
      }
      if (services.cancelledDrafts.has(params.draftId)) throw Object.assign(new Error("AI draft cancelled."), { code: "AI_DRAFT_CANCELLED" });
      const template = parseRawTemplate(output);
      if (template) return { template };
      repair = ["The result was not an Atomize Template-shaped YAML object. Return YAML with version, name, filter, and a tasks array."];
    }
    throw Object.assign(new Error("Copilot did not return a usable Template. Your description is still available to edit."), { code: "AI_DRAFT_MALFORMED" });
  } catch (error) {
    if (services.cancelledDrafts.has(params.draftId)) throw Object.assign(new Error("AI draft cancelled."), { code: "AI_DRAFT_CANCELLED" });
    throw error;
  } finally {
    services.drafts.delete(params.draftId);
    services.cancelledDrafts.delete(params.draftId);
    await session.dispose();
  }
}

async function cancelDraft(params: unknown, services: SidecarServices): Promise<{ cancelled: boolean }> {
  const draftId = typeof params === "object" && params !== null ? (params as { draftId?: unknown }).draftId : undefined;
  if (typeof draftId !== "string" || !draftId) throw Object.assign(new Error("AI cancellation requires a draft id."), { code: "INVALID_PARAMS" });
  const session = services.drafts.get(draftId);
  if (!session) return { cancelled: false };
  services.cancelledDrafts.add(draftId);
  await session.abort();
  return { cancelled: true };
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

/** Composes a local file's `extends`/`mixins` for Studio's Open, without throwing on field-level invalidity — see ADR-0048. */
export async function resolveLocalTemplate(path: string, services: SidecarServices): Promise<unknown> {
  try {
    const runnable = await services.library.getRunnableTemplate(path, { validate: false });
    return runnable.template;
  } catch (error) {
    throw Object.assign(
      new Error(`Atomize Studio could not resolve this template's extends/mixins: ${getErrorMessage(error)}`),
      { code: "TEMPLATE_RESOLUTION_FAILED" },
    );
  }
}

function resolveLocalTemplateParams(params: unknown): { path: string } {
  if (typeof params !== "object" || params === null || typeof (params as { path?: unknown }).path !== "string" || !(params as { path: string }).path.trim()) {
    throw Object.assign(new Error("Resolving a local template requires a file path."), { code: "INVALID_PARAMS" });
  }
  return params as { path: string };
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
    .with("ai.generate", () => generateDraft(aiDraftParams(request.params), services))
    .with("ai.cancel", () => cancelDraft(request.params, services))
    .with("template.resolveLocal", () => resolveLocalTemplate(resolveLocalTemplateParams(request.params).path, services))
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
