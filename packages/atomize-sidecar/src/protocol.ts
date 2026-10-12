import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { type AIDraftSession, CopilotAuthenticationError, GitHubCopilotProvider } from "@sppg2001/atomize-ai";
import { Atomizer, buildAzureDevOpsConfig, PlatformFactory, TemplateLibrary } from "@sppg2001/atomize-core";
import type { AtomizationReport, ProgressEvent } from "@sppg2001/atomize-core/core/atomizer";
import { FilterEngine } from "@sppg2001/atomize-core/core/filter-engine";
import { requireProjectMetadataReader, requireSavedQueryReader } from "@sppg2001/atomize-core/platforms/capabilities";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import type { WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import { type StorySummary, searchStories } from "@sppg2001/atomize-core/services/story-search";
import { draftTemplate, improveTemplate } from "@sppg2001/atomize-core/services/template/ai-template-loop";
import {
  fetchProjectGrounding,
  type ProjectGrounding,
  type ProjectGroundingErrorCode,
  toProjectGroundingError,
} from "@sppg2001/atomize-core/services/template/project-grounding";
import {
  type DocumentGrounding,
  fitDocumentsToLimit,
  listProjectWikis,
  listWikiPagePaths,
  loadLocalReference,
  loadWikiReference,
  parseReferenceRef,
  type ReferenceDocument,
  ReferenceDocumentError,
  readProjectReferences,
  saveProjectReference,
  truncationNotices,
} from "@sppg2001/atomize-core/services/template/reference-documents";
import {
  fetchStoryGrounding,
  listAppliedStories,
  type StoryGrounding,
  toStoryGroundingError,
} from "@sppg2001/atomize-core/services/template/story-grounding";
import { TemplateCatalog, type TemplateCatalogKind, type TemplateCatalogScope } from "@sppg2001/atomize-core/services/template/template-catalog";
import { discoverWorkspaceRoot } from "@sppg2001/atomize-core/services/template/workspace-root";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import { TemplateSourceResolver } from "@sppg2001/atomize-core/templates/source-resolver";
import { inspectTemplate, parseMockStory, runPreview } from "@sppg2001/atomize-core/templates/template-inspector";
import { type TemplateVerificationResult, verifyTemplate } from "@sppg2001/atomize-core/templates/template-verification";
import { AuthError, ConfigurationError, getErrorMessage, PlatformError } from "@sppg2001/atomize-core/utils/errors";
import { match } from "ts-pattern";
import { parse as parseYaml } from "yaml";

export type RpcRequest = { jsonrpc: "2.0"; id: number; method: string; params?: unknown };
export type RpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code: string; message: string } };
export type RpcNotification =
  | { jsonrpc: "2.0"; method: "sidecar.ready" }
  | { jsonrpc: "2.0"; method: "ai.progress"; params: { draftId: string; length: number } }
  | { jsonrpc: "2.0"; method: "generate.progress"; params: { runId: string; event: ProgressEvent } };
export type SidecarTemplateLibrary = Pick<TemplateLibrary, "getCatalogAll" | "getRunnableTemplate" | "removeCatalogItem" | "installTemplate">;
export type GroundingConnection = { organizationUrl: string; project: string; team: string; token: string };
export type OnlineValidationParams = { template: TaskTemplate; connection: GroundingConnection };
export type AIDraftParams = { draftId: string; prose: string; grounding?: unknown; storyGrounding?: unknown; documentGrounding?: unknown };
/** Where Reference Documents are looked up: a Workspace Root, discovered from a folder or file inside it. */
export type ReferencesListParams = { startPath: string };
export type ReferencesSaveParams = { workspaceRoot: string; entry: string };
/** Reference Documents to load and fit; wiki entries need the Rust-injected connection. */
export type ReferencesLoadParams = { workspaceRoot: string; entries: string[]; connection?: GroundingConnection };
export type ReferencesLoadResult = { grounding: DocumentGrounding | null; notices: string[]; skipped: { entry: string; message: string }[] };
export type WikiPagesParams = { connection: GroundingConnection; wiki: string };
/** A Story Search for the Story Browser's Search mode; the connection carries a Rust-injected token. */
export type StorySearchParams = { connection: GroundingConnection; search: Record<string, unknown> };
/** Example or applied Stories to ground an AI request in, as Story Grounding. */
export type StoryGroundingParams = { connection: GroundingConnection; storyIds: string[]; includeSensitive?: boolean };
export type AIImproveParams = { draftId: string; template: Record<string, unknown>; guidance?: string | null; grounding?: unknown; storyGrounding?: unknown; documentGrounding?: unknown };
/** The Stories a Template has been applied to, for the Story Browser's default view in Improve. */
export type AppliedStoriesParams = { connection: GroundingConnection; templateFilter: Record<string, unknown> };
/** Which Stories a `generate.run`/`generate.queryStories` call processes — see CONTEXT.md's "Generate Scope". */
export type GenerateScope = { kind: "stories"; storyIds: string[] } | { kind: "filter" };
export type GenerateQueryStoriesParams = { source: string; connection: GroundingConnection };
export type GenerateRunParams = { runId: string; source: string; connection: GroundingConnection; dryRun: boolean; scope: GenerateScope; continueOnError?: boolean };
export type SidecarServices = {
  library: SidecarTemplateLibrary;
  fetchGrounding: (connection: GroundingConnection) => Promise<ProjectGrounding>;
  searchStories: (params: StorySearchParams) => Promise<{ stories: StorySummary[] }>;
  fetchStoryGrounding: (params: StoryGroundingParams) => Promise<StoryGrounding>;
  listAppliedStories: (params: AppliedStoriesParams) => Promise<{ stories: StorySummary[] }>;
  validateOnline: (params: OnlineValidationParams, signal: AbortSignal) => Promise<TemplateVerificationResult>;
  queryGenerateStories: (params: GenerateQueryStoriesParams) => Promise<{ stories: WorkItem[] }>;
  runGenerate: (params: GenerateRunParams, signal: AbortSignal) => Promise<{ report: AtomizationReport }>;
  createDraftSession: () => Promise<AIDraftSession>;
  checkCopilotAuth: () => Promise<{ authenticated: boolean }>;
  drafts: Map<string, AIDraftSession>;
  cancelledDrafts: Set<string>;
  activeRequests: Map<number, AbortController>;
  /** Writes an out-of-band notification (no request id) to the transport, e.g. live AI draft progress. */
  notify: (notification: RpcNotification) => void;
};

/**
 * The Template Library, with its project Catalog under the Workspace Root found from `projectFolder`
 * (the folder the user chose), so a project Template and a Project Reference Document picked from
 * the same folder land in the same `.atomize/`.
 */
export function createTemplateLibrary(projectFolder?: string): TemplateLibrary {
  // The CI bundle copies atomize-core's catalog beside the sidecar binary.
  const packageRoot = process.env.ATOMIZE_CATALOG_ROOT;
  const workspaceRoot = projectFolder ? discoverWorkspaceRoot(projectFolder) : undefined;
  // Catalog listing and catalog-reference resolution must use the same root. The
  // bundled Studio catalog is not at atomize-core's default package location.
  const catalog = new TemplateCatalog({
    ...(packageRoot ? { packageRoot } : {}),
    ...(workspaceRoot ? {
      projectRoot: resolve(workspaceRoot, ".atomize", "catalog"),
      legacyProjectRoot: resolve(workspaceRoot, ".atomize", "templates"),
    } : {}),
  });
  return new TemplateLibrary(new TemplateSourceResolver(undefined, catalog), catalog);
}

export function createSidecarServices(library = createTemplateLibrary()): SidecarServices {
  const provider = new GitHubCopilotProvider();
  const notify: SidecarServices["notify"] = (notification) => process.stdout.write(`${JSON.stringify(notification)}\n`);
  return {
    library,
    fetchGrounding,
    searchStories: searchStoriesFor,
    fetchStoryGrounding: fetchStoryGroundingFor,
    listAppliedStories: listAppliedStoriesFor,
    validateOnline,
    queryGenerateStories: (params) => queryGenerateStories(params, library),
    runGenerate: (params, signal) => runGenerate(params, library, notify, signal),
    createDraftSession: () => provider.createDraftSession(),
    checkCopilotAuth: async () => ({ authenticated: await provider.checkAuthStatus() }),
    drafts: new Map(),
    cancelledDrafts: new Set(),
    activeRequests: new Map(),
    notify,
  };
}

async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw Object.assign(new Error("Request cancelled."), { code: "REQUEST_CANCELLED" });
  return await Promise.race([
    work,
    new Promise<T>((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("Request cancelled."), { code: "REQUEST_CANCELLED" })), { once: true })),
  ]);
}

export async function validateOnline(params: OnlineValidationParams, signal: AbortSignal): Promise<TemplateVerificationResult> {
  try {
    const adapter = PlatformFactory.create("azure-devops", buildAzureDevOpsConfig(params.connection, params.connection.token));
    await abortable(adapter.authenticate(), signal);
    const metadataReader = requireProjectMetadataReader(adapter);
    const queryReader = requireSavedQueryReader(adapter);
    return await abortable(verifyTemplate(params.template, {
      project: {
        mode: "online",
        platform: {
          getFieldSchemas: (workItemType) => metadataReader.getFieldSchemas(workItemType),
          listSavedQueries: () => queryReader.listSavedQueries(),
          getEstimationDefaults: () => adapter.getEstimationDefaults(),
          getWorkItemTypes: adapter.getWorkItemTypes?.bind(adapter),
        },
      },
    }), signal);
  } catch (error) {
    if (signal.aborted) throw error;
    const message = getErrorMessage(error);
    const code = error instanceof AuthError || /authentication failed|access denied/i.test(message)
      ? (/token.*expired|personal access token.*expired/i.test(message) ? "VALIDATION_TOKEN_EXPIRED" : "VALIDATION_AUTH_FAILED")
      : "ONLINE_VALIDATION_FAILED";
    throw Object.assign(new Error(code === "VALIDATION_TOKEN_EXPIRED"
      ? "Your Azure DevOps access token has expired. Rotate the token in Studio, then try again."
      : code === "VALIDATION_AUTH_FAILED"
        ? "Atomize could not sign in to this Azure DevOps project. Check its access token, then try again."
        : "Atomize could not validate this Template against Azure DevOps. Check the connection and try again."), { code });
  }
}

function aiDraftParams(params: unknown): AIDraftParams {
  if (typeof params !== "object" || params === null) throw Object.assign(new Error("AI drafting requires a draft id and description."), { code: "INVALID_PARAMS" });
  const value = params as Partial<AIDraftParams>;
  if (typeof value.draftId !== "string" || !value.draftId || typeof value.prose !== "string" || !value.prose.trim()) {
    throw Object.assign(new Error("AI drafting requires a draft id and description."), { code: "INVALID_PARAMS" });
  }
  return value as AIDraftParams;
}

/**
 * Runs one AI request on a fresh Copilot Session registered under `draftId`, so `ai.cancel` can stop
 * it and `ai.progress` reports its stream — the shared shape of `ai.generate` and `ai.improve`.
 */
async function withAISession<T>(
  draftId: string,
  services: SidecarServices,
  run: (session: AIDraftSession, options: { signal: AbortSignal; onChunk: (chunk: string) => void }) => Promise<T>,
): Promise<T> {
  if (services.drafts.has(draftId)) throw Object.assign(new Error("That AI request is already running."), { code: "AI_DRAFT_IN_PROGRESS" });
  let session: AIDraftSession;
  try { session = await services.createDraftSession(); }
  catch (error) {
    if (error instanceof CopilotAuthenticationError) throw Object.assign(error, { code: "COPILOT_AUTH_REQUIRED" });
    throw error;
  }
  // Cancelling through `ai.cancel` aborts the session and stops the loop before any further repair attempt.
  const cancellation = new AbortController();
  services.drafts.set(draftId, { ...session, abort: async () => { cancellation.abort(); await session.abort(); } });
  try {
    let received = 0;
    const result = await run(session, {
      signal: cancellation.signal,
      onChunk: (chunk) => {
        received += chunk.length;
        services.notify({ jsonrpc: "2.0", method: "ai.progress", params: { draftId, length: received } });
      },
    });
    if (services.cancelledDrafts.has(draftId)) throw Object.assign(new Error("AI request cancelled."), { code: "AI_DRAFT_CANCELLED" });
    return result;
  } catch (error) {
    if (services.cancelledDrafts.has(draftId)) throw Object.assign(new Error("AI request cancelled."), { code: "AI_DRAFT_CANCELLED" });
    throw error;
  } finally {
    services.drafts.delete(draftId);
    services.cancelledDrafts.delete(draftId);
    await session.dispose();
  }
}

async function generateDraft(params: AIDraftParams, services: SidecarServices): Promise<{ template: Record<string, unknown>; errors?: string[] }> {
  const result = await withAISession(params.draftId, services, (session, options) =>
    draftTemplate(session, {
      prose: params.prose,
      projectGrounding: params.grounding as ProjectGrounding | undefined,
      storyGrounding: params.storyGrounding as StoryGrounding | undefined,
      documentGrounding: params.documentGrounding as DocumentGrounding | undefined,
    }, options));
  if (result.ok) return { template: result.template as unknown as Record<string, unknown> };
  // A Template-shaped draft that still fails validation stays editable in Studio, where its errors show.
  if (result.template) return { template: result.template, errors: result.errors };
  throw Object.assign(new Error("Copilot did not return a usable Template. Your description is still available to edit."), { code: "AI_DRAFT_MALFORMED" });
}

/**
 * A Template Improvement of the Template open in Studio. Studio flattens `extends` and Mixins when
 * it loads a Template (ADR-0048), so the authored Template is also its Resolved Template.
 */
async function improveDraft(params: AIImproveParams, services: SidecarServices): Promise<{ template: Record<string, unknown>; notes: string[]; errors?: string[] }> {
  const template = params.template as TaskTemplate;
  const result = await withAISession(params.draftId, services, (session, options) =>
    improveTemplate(session, {
      template,
      resolvedTemplate: template,
      guidance: params.guidance ?? null,
      projectGrounding: (params.grounding as ProjectGrounding | undefined) ?? null,
      storyGrounding: (params.storyGrounding as StoryGrounding | undefined) ?? null,
      documentGrounding: (params.documentGrounding as DocumentGrounding | undefined) ?? null,
    }, options));
  if (result.ok) return { template: result.template as unknown as Record<string, unknown>, notes: result.notes };
  if (result.template) return { template: result.template, notes: result.notes, errors: result.errors };
  throw Object.assign(new Error("Copilot did not return a usable proposal. Your Template is unchanged."), { code: "AI_DRAFT_MALFORMED" });
}

function aiImproveParams(params: unknown): AIImproveParams {
  const value = (typeof params === "object" && params !== null ? params : {}) as Partial<AIImproveParams>;
  if (typeof value.draftId !== "string" || !value.draftId || typeof value.template !== "object" || value.template === null || Array.isArray(value.template)) {
    throw Object.assign(new Error("Improving with AI requires a request id and the Template."), { code: "INVALID_PARAMS" });
  }
  if (value.guidance !== undefined && value.guidance !== null && typeof value.guidance !== "string") {
    throw Object.assign(new Error("Improvement guidance must be text."), { code: "INVALID_PARAMS" });
  }
  return value as AIImproveParams;
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

/** Studio's wording for each Project Grounding failure, pointing at Studio's own fixes. */
const GROUNDING_MESSAGES: Record<ProjectGroundingErrorCode, string> = {
  GROUNDING_TOKEN_EXPIRED: "Your Azure DevOps access token has expired. Add a new project connection with a current token, then try again.",
  GROUNDING_AUTH_FAILED: "Atomize could not sign in to this Azure DevOps project. Check its access token, then try again.",
  GROUNDING_FETCH_FAILED: "Atomize could not load choices from this Azure DevOps project. Check the connection and try again.",
};

export async function fetchGrounding(connection: GroundingConnection): Promise<ProjectGrounding> {
  try {
    const adapter = PlatformFactory.create("azure-devops", buildAzureDevOpsConfig(connection, connection.token));
    await adapter.authenticate();
    return await fetchProjectGrounding(adapter);
  } catch (error) {
    const { code } = toProjectGroundingError(error);
    throw Object.assign(new Error(GROUNDING_MESSAGES[code]), { code });
  }
}

/** Runs a Story Search with only the search criteria Studio may set; the limit is capped by atomize-core. */
export async function searchStoriesFor(params: StorySearchParams): Promise<{ stories: StorySummary[] }> {
  try {
    const adapter = PlatformFactory.create("azure-devops", buildAzureDevOpsConfig(params.connection, params.connection.token));
    await adapter.authenticate();
    const search = params.search;
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined);
    return {
      stories: await searchStories(adapter, {
        ...(typeof search.text === "string" ? { text: search.text } : {}),
        ...(list(search.workItemTypes) ? { workItemTypes: list(search.workItemTypes) } : {}),
        ...(list(search.states) ? { states: list(search.states) } : {}),
        ...(list(search.areaPaths) ? { areaPaths: list(search.areaPaths) } : {}),
        ...(list(search.iterations) ? { iterations: list(search.iterations) } : {}),
        ...(typeof search.hasTasks === "boolean" ? { hasTasks: search.hasTasks } : {}),
        ...(typeof search.limit === "number" ? { limit: search.limit } : {}),
      }),
    };
  } catch (error) {
    const classified = classifyGenerateAdapterError(error, "STORIES_TOKEN_EXPIRED", "STORIES_AUTH_FAILED", "STORIES_SEARCH_FAILED", "Atomize could not search Stories in Azure DevOps. Check the connection and try again.");
    throw Object.assign(new Error(classified.message), { code: classified.code });
  }
}

/** Reads Story Grounding; the codes are atomize-core's, so Studio treats them like Project Grounding failures. */
export async function fetchStoryGroundingFor(params: StoryGroundingParams): Promise<StoryGrounding> {
  try {
    const adapter = PlatformFactory.create("azure-devops", buildAzureDevOpsConfig(params.connection, params.connection.token));
    await adapter.authenticate();
    return await fetchStoryGrounding(adapter, params.storyIds, { includeSensitive: params.includeSensitive === true });
  } catch (error) {
    const { code, message } = toStoryGroundingError(error);
    throw Object.assign(new Error(message), { code });
  }
}

/** The Workspace Root around a folder or file, and its Project Reference Documents (ADR-0070). */
export async function listReferences(params: ReferencesListParams): Promise<{ workspaceRoot: string; entries: string[]; problems: string[] }> {
  const start = await isDirectory(params.startPath) ? params.startPath : dirname(params.startPath);
  const workspaceRoot = discoverWorkspaceRoot(start);
  return { workspaceRoot, ...await readProjectReferences(workspaceRoot) };
}

/** Records an entry in `.atomize/ai.yaml`, validating it first. */
export async function saveReference(params: ReferencesSaveParams): Promise<{ saved: true }> {
  try {
    await saveProjectReference(params.workspaceRoot, params.entry);
    return { saved: true };
  } catch (error) {
    throw Object.assign(new Error(getErrorMessage(error)), { code: error instanceof ReferenceDocumentError ? error.code : "REFERENCE_SAVE_FAILED" });
  }
}

/**
 * Loads the chosen Reference Documents and fits them to the shared limit. A document that can't be
 * used is reported, never silently dropped; the shortening notices are shown before sending.
 */
export async function loadReferences(params: ReferencesLoadParams): Promise<ReferencesLoadResult> {
  const documents: ReferenceDocument[] = [];
  const skipped: { entry: string; message: string }[] = [];
  let adapter: Promise<IPlatformAdapter> | undefined;
  const connect = () => {
    const connection = params.connection;
    if (!connection) throw new ReferenceDocumentError("REFERENCE_UNAVAILABLE", "Wiki pages need a Work Project to read them through.");
    adapter ??= (async () => {
      const platform = PlatformFactory.create("azure-devops", buildAzureDevOpsConfig(connection, connection.token));
      await platform.authenticate();
      return platform;
    })();
    return adapter;
  };
  for (const entry of params.entries) {
    try {
      const ref = parseReferenceRef(entry);
      documents.push(ref.kind === "wiki" ? await loadWikiReference(await connect(), ref) : await loadLocalReference(params.workspaceRoot, ref.path));
    } catch (error) {
      skipped.push({ entry, message: getErrorMessage(error) });
    }
  }
  if (documents.length === 0) return { grounding: null, notices: [], skipped };
  const grounding = fitDocumentsToLimit(documents);
  return { grounding, notices: truncationNotices(grounding), skipped };
}

/** Lists the wikis in the Work Project's project, for picking wiki pages. */
export async function listWikis(connection: GroundingConnection): Promise<{ wikis: { id: string; name: string }[] }> {
  return withWikiAdapter(connection, async (platform) => ({ wikis: await listProjectWikis(platform) }));
}

export async function listWikiPages(params: WikiPagesParams): Promise<{ paths: string[] }> {
  return withWikiAdapter(params.connection, async (platform) => ({ paths: await listWikiPagePaths(platform, params.wiki) }));
}

async function withWikiAdapter<T>(connection: GroundingConnection, run: (platform: IPlatformAdapter) => Promise<T>): Promise<T> {
  try {
    const platform = PlatformFactory.create("azure-devops", buildAzureDevOpsConfig(connection, connection.token));
    await platform.authenticate();
    return await run(platform);
  } catch (error) {
    throw Object.assign(new Error(getErrorMessage(error)), { code: error instanceof ReferenceDocumentError ? error.code : "WIKI_READ_FAILED" });
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function stringParam(params: unknown, key: string, label: string): string {
  const value = typeof params === "object" && params !== null ? (params as Record<string, unknown>)[key] : undefined;
  if (typeof value !== "string" || !value.trim()) throw Object.assign(new Error(`${label} is required.`), { code: "INVALID_PARAMS" });
  return value;
}

function referencesLoadParams(params: unknown): ReferencesLoadParams {
  const value = (typeof params === "object" && params !== null ? params : {}) as Partial<ReferencesLoadParams>;
  if (!Array.isArray(value.entries) || value.entries.some((entry) => typeof entry !== "string")) {
    throw Object.assign(new Error("Loading Reference Documents needs a list of entries."), { code: "INVALID_PARAMS" });
  }
  return {
    workspaceRoot: stringParam(params, "workspaceRoot", "A project folder"),
    entries: value.entries,
    ...(value.connection ? { connection: groundingConnection(value.connection) } : {}),
  };
}

/** Lists Stories the Template's filter matches that already have Tasks (its excludeIfHasTasks turned off). */
export async function listAppliedStoriesFor(params: AppliedStoriesParams): Promise<{ stories: StorySummary[] }> {
  try {
    const adapter = PlatformFactory.create("azure-devops", buildAzureDevOpsConfig(params.connection, params.connection.token));
    await adapter.authenticate();
    return { stories: await listAppliedStories(adapter, params.templateFilter as TaskTemplate["filter"]) };
  } catch (error) {
    const { code, message } = toStoryGroundingError(error);
    throw Object.assign(new Error(message), { code });
  }
}

function appliedStoriesParams(params: unknown): AppliedStoriesParams {
  const value = (typeof params === "object" && params !== null ? params : {}) as Partial<AppliedStoriesParams>;
  if (typeof value.templateFilter !== "object" || value.templateFilter === null || Array.isArray(value.templateFilter)) {
    throw Object.assign(new Error("Listing applied Stories needs the Template's filter."), { code: "INVALID_PARAMS" });
  }
  return { connection: groundingConnection(value.connection), templateFilter: value.templateFilter as Record<string, unknown> };
}

function storySearchParams(params: unknown): StorySearchParams {
  const value = (typeof params === "object" && params !== null ? params : {}) as Partial<StorySearchParams>;
  if (typeof value.search !== "object" || value.search === null || Array.isArray(value.search)) {
    throw Object.assign(new Error("A Story Search needs search criteria."), { code: "INVALID_PARAMS" });
  }
  return { connection: groundingConnection(value.connection), search: value.search as Record<string, unknown> };
}

function storyGroundingParams(params: unknown): StoryGroundingParams {
  const value = (typeof params === "object" && params !== null ? params : {}) as Partial<StoryGroundingParams>;
  if (!Array.isArray(value.storyIds) || value.storyIds.some((id) => typeof id !== "string")) {
    throw Object.assign(new Error("Story Grounding needs a list of Story IDs."), { code: "INVALID_PARAMS" });
  }
  return { connection: groundingConnection(value.connection), storyIds: value.storyIds, includeSensitive: value.includeSensitive === true };
}

async function resolveGenerateTemplate(source: string, library: SidecarTemplateLibrary): Promise<TaskTemplate> {
  try {
    const runnable = await library.getRunnableTemplate(source, { validate: false });
    return runnable.template;
  } catch (error) {
    throw Object.assign(new Error(`Atomize Studio could not resolve this Template: ${getErrorMessage(error)}`), { code: "TEMPLATE_RESOLUTION_FAILED" });
  }
}

export function classifyGenerateAdapterError(error: unknown, tokenExpiredCode: string, authFailedCode: string, defaultCode: string, defaultMessage: string): { code: string; message: string } {
  const message = getErrorMessage(error);
  if (error instanceof AuthError || /authentication failed|access denied/i.test(message)) {
    return /token.*expired|personal access token.*expired/i.test(message)
      ? { code: tokenExpiredCode, message: "Your Azure DevOps access token has expired. Rotate the token in Studio, then try again." }
      : { code: authFailedCode, message: "Atomize could not sign in to this Azure DevOps project. Check its access token, then try again." };
  }
  // AzureDevOpsAdapter constructs PlatformError messages from its sanitised REST response. They
  // identify template rules, missing fields, and permission failures without exposing the PAT.
  if (error instanceof PlatformError || error instanceof ConfigurationError) {
    return {
      code: defaultCode,
      message: `${defaultMessage.replace(/\. Check the connection and try again\.$/, "")}: ${message}`,
    };
  }
  return { code: defaultCode, message: defaultMessage };
}

/** Wraps `queryWorkItems` for the Generate Area's Story browser — see ADR-0056 (Generate Scope via Story browser). */
export async function queryGenerateStories(params: GenerateQueryStoriesParams, library: SidecarTemplateLibrary): Promise<{ stories: WorkItem[] }> {
  const template = await resolveGenerateTemplate(params.source, library);
  try {
    const adapter = PlatformFactory.create("azure-devops", buildAzureDevOpsConfig(params.connection, params.connection.token));
    await adapter.authenticate();
    const connectUserEmail = await adapter.getConnectUserEmail();
    const platformFilter = new FilterEngine().convertFilter(template.filter, connectUserEmail);
    const stories = await adapter.queryWorkItems(platformFilter);
    return { stories };
  } catch (error) {
    const classified = classifyGenerateAdapterError(error, "GENERATE_TOKEN_EXPIRED", "GENERATE_AUTH_FAILED", "GENERATE_QUERY_FAILED", "Atomize could not fetch Stories from Azure DevOps. Check the connection and try again.");
    throw Object.assign(new Error(classified.message), { code: classified.code });
  }
}

/**
 * Wraps `Atomizer.atomize` for the Generate Area — one call for both Live Preview (`dryRun: true`)
 * and Execute (`dryRun: false`), see ADR-0055. The per-request `signal` (routed by Rust as a raw
 * `$/cancelRequest`, mirroring `validation.online`/`validation.cancel`) is passed straight into
 * `atomize()`'s options, so a caller-initiated cancel stops at the next batch boundary — see
 * ADR-0057. Stories whose batch was already in flight when cancel was requested still complete.
 */
export async function runGenerate(params: GenerateRunParams, library: SidecarTemplateLibrary, notify: SidecarServices["notify"], signal: AbortSignal): Promise<{ report: AtomizationReport }> {
  const template = await resolveGenerateTemplate(params.source, library);
  try {
    const adapter = PlatformFactory.create("azure-devops", buildAzureDevOpsConfig(params.connection, params.connection.token));
    await abortable(adapter.authenticate(), signal);
    const atomizer = new Atomizer(adapter);
    const report = await atomizer.atomize(template, {
      dryRun: params.dryRun,
      continueOnError: params.continueOnError,
      storyIds: params.scope.kind === "stories" ? params.scope.storyIds : undefined,
      onProgress: (event) => notify({ jsonrpc: "2.0", method: "generate.progress", params: { runId: params.runId, event } }),
      signal,
    });
    return { report };
  } catch (error) {
    if (signal.aborted) throw error;
    const classified = classifyGenerateAdapterError(error, "GENERATE_TOKEN_EXPIRED", "GENERATE_AUTH_FAILED", "GENERATE_RUN_FAILED", "Atomize could not complete this Generate run. Check the connection and try again.");
    throw Object.assign(new Error(classified.message), { code: classified.code });
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

/** Resolves a Generate Area Preview Source (Catalog ref or local path) for Mock Preview, tolerating field-level invalidity the same way Open does — see ADR-0048. */
async function resolvePreviewSource(source: string, services: SidecarServices) {
  try {
    const runnable = await services.library.getRunnableTemplate(source, { validate: false });
    return runnable.template;
  } catch (error) {
    throw Object.assign(new Error(`Atomize Studio could not resolve this Template: ${getErrorMessage(error)}`), { code: "TEMPLATE_RESOLUTION_FAILED" });
  }
}

function inspectPreviewParams(params: unknown): { source: string } {
  if (typeof params !== "object" || params === null || typeof (params as { source?: unknown }).source !== "string" || !(params as { source: string }).source.trim()) {
    throw Object.assign(new Error("Inspecting a Template requires its source."), { code: "INVALID_PARAMS" });
  }
  return { source: (params as { source: string }).source };
}

function mockStoryPreviewParams(params: unknown): { source: string; mockStory: string } {
  const invalid = () => Object.assign(new Error("Previewing a Template requires its source and mock Story values."), { code: "INVALID_PARAMS" });
  if (typeof params !== "object" || params === null) throw invalid();
  const value = params as Partial<{ source: unknown; mockStory: unknown }>;
  if (typeof value.source !== "string" || !value.source.trim() || typeof value.mockStory !== "string") throw invalid();
  return { source: value.source, mockStory: value.mockStory };
}

function removeCatalogItemParams(params: unknown): { kind: TemplateCatalogKind; name: string } {
  if (typeof params !== "object" || params === null) throw Object.assign(new Error("Removing a Catalog item requires its kind and name."), { code: "INVALID_PARAMS" });
  const value = params as Partial<{ kind: unknown; name: unknown }>;
  if ((value.kind !== "template" && value.kind !== "mixin") || typeof value.name !== "string" || !value.name.trim()) {
    throw Object.assign(new Error("Removing a Catalog item requires its kind and name."), { code: "INVALID_PARAMS" });
  }
  return { kind: value.kind, name: value.name };
}

type InstallCatalogItemParams = {
  content: string;
  name: string;
  scope: Extract<TemplateCatalogScope, "user" | "project">;
  overwrite: boolean;
  workspaceRoot?: string;
};

function installCatalogItemParams(params: unknown): InstallCatalogItemParams {
  const invalid = () => Object.assign(new Error("Installing a Catalog item requires its content, name, and scope."), { code: "INVALID_PARAMS" });
  if (typeof params !== "object" || params === null) throw invalid();
  const value = params as Partial<{ content: unknown; name: unknown; scope: unknown; overwrite: unknown; workspaceRoot: unknown }>;
  if (
    typeof value.content !== "string" || !value.content.trim()
    || typeof value.name !== "string" || !value.name.trim()
    || (value.scope !== "user" && value.scope !== "project")
  ) {
    throw invalid();
  }
  if (value.scope === "project" && (typeof value.workspaceRoot !== "string" || !value.workspaceRoot.trim() || !isAbsolute(value.workspaceRoot) || resolve(value.workspaceRoot) === "/")) {
    throw Object.assign(new Error("Choose a project folder before installing to the project Catalog."), { code: "PROJECT_WORKSPACE_REQUIRED" });
  }
  return { content: value.content, name: value.name, scope: value.scope, overwrite: value.overwrite === true, workspaceRoot: typeof value.workspaceRoot === "string" ? value.workspaceRoot : undefined };
}

function groundingConnection(params: unknown): GroundingConnection {
  if (typeof params !== "object" || params === null) throw Object.assign(new Error("Grounding requires a resolved connection."), { code: "INVALID_PARAMS" });
  const value = params as Partial<GroundingConnection>;
  if ([value.organizationUrl, value.project, value.team, value.token].some(field => typeof field !== "string" || !field.trim())) {
    throw Object.assign(new Error("Grounding requires a resolved connection."), { code: "INVALID_PARAMS" });
  }
  return value as GroundingConnection;
}

function onlineValidationParams(params: unknown): OnlineValidationParams {
  if (typeof params !== "object" || params === null) throw Object.assign(new Error("Online Validation requires a Template and resolved connection."), { code: "INVALID_PARAMS" });
  const value = params as Partial<OnlineValidationParams>;
  if (typeof value.template !== "object" || value.template === null || Array.isArray(value.template)) {
    throw Object.assign(new Error("Online Validation requires a Template."), { code: "INVALID_PARAMS" });
  }
  return { template: value.template as TaskTemplate, connection: groundingConnection(value.connection) };
}

function generateScope(value: unknown): GenerateScope {
  const invalid = () => Object.assign(new Error("Generate requires a scope of Stories or the Template's filter."), { code: "INVALID_PARAMS" });
  if (typeof value !== "object" || value === null) throw invalid();
  const scope = value as Partial<{ kind: unknown; storyIds: unknown }>;
  if (scope.kind === "filter") return { kind: "filter" };
  if (scope.kind === "stories" && Array.isArray(scope.storyIds) && scope.storyIds.length > 0 && scope.storyIds.every((id) => typeof id === "string")) {
    return { kind: "stories", storyIds: scope.storyIds as string[] };
  }
  throw invalid();
}

function generateQueryStoriesParams(params: unknown): GenerateQueryStoriesParams {
  if (typeof params !== "object" || params === null || typeof (params as { source?: unknown }).source !== "string" || !(params as { source: string }).source.trim()) {
    throw Object.assign(new Error("Browsing Stories requires a Template source and a resolved connection."), { code: "INVALID_PARAMS" });
  }
  return { source: (params as { source: string }).source, connection: groundingConnection((params as { connection?: unknown }).connection) };
}

function generateRunParams(params: unknown): GenerateRunParams {
  const invalid = () => Object.assign(new Error("Generating requires a run id, Template source, resolved connection, scope, and dryRun flag."), { code: "INVALID_PARAMS" });
  if (typeof params !== "object" || params === null) throw invalid();
  const value = params as Partial<{ runId: unknown; source: unknown; connection: unknown; dryRun: unknown; scope: unknown; continueOnError: unknown }>;
  if (typeof value.runId !== "string" || !value.runId || typeof value.source !== "string" || !value.source.trim() || typeof value.dryRun !== "boolean") {
    throw invalid();
  }
  return {
    runId: value.runId,
    source: value.source,
    connection: groundingConnection(value.connection),
    dryRun: value.dryRun,
    scope: generateScope(value.scope),
    continueOnError: value.continueOnError === true,
  };
}

export async function dispatch(request: RpcRequest, services: SidecarServices, signal: AbortSignal): Promise<unknown> {
  return await match(request.method)
    .with("catalog.list", async () => {
      const { items } = await services.library.getCatalogAll();
      return await Promise.all(items.map(async item => ({ ...item, content: parseYaml(await readFile(item.path, "utf8")) })));
    })
    .with("catalog.remove", async () => {
      const { kind, name } = removeCatalogItemParams(request.params);
      await services.library.removeCatalogItem(kind, name);
      return { removed: true };
    })
    .with("catalog.install", async () => {
      const { content, name, scope, overwrite, workspaceRoot } = installCatalogItemParams(request.params);
      const library = scope === "project" ? createTemplateLibrary(workspaceRoot) : services.library;
      return await library.installTemplate({ source: { content, name }, scope, overwrite });
    })
    .with("grounding.fetch", () => services.fetchGrounding(groundingConnection(request.params)))
    .with("stories.search", () => services.searchStories(storySearchParams(request.params)))
    .with("grounding.stories", () => services.fetchStoryGrounding(storyGroundingParams(request.params)))
    .with("stories.applied", () => services.listAppliedStories(appliedStoriesParams(request.params)))
    .with("references.list", () => listReferences({ startPath: stringParam(request.params, "startPath", "A project folder") }))
    .with("references.save", () => saveReference({ workspaceRoot: stringParam(request.params, "workspaceRoot", "A project folder"), entry: stringParam(request.params, "entry", "A Reference Document") }))
    .with("references.load", () => loadReferences(referencesLoadParams(request.params)))
    .with("wiki.list", () => listWikis(groundingConnection((request.params as { connection?: unknown } | undefined)?.connection)))
    .with("wiki.pages", () => listWikiPages({ connection: groundingConnection((request.params as { connection?: unknown } | undefined)?.connection), wiki: stringParam(request.params, "wiki", "A wiki") }))
    .with("validation.online", () => services.validateOnline(onlineValidationParams(request.params), signal))
    .with("ai.generate", () => generateDraft(aiDraftParams(request.params), services))
    .with("ai.improve", () => improveDraft(aiImproveParams(request.params), services))
    .with("ai.cancel", () => cancelDraft(request.params, services))
    .with("ai.authStatus", () => services.checkCopilotAuth())
    .with("template.resolveLocal", () => resolveLocalTemplate(resolveLocalTemplateParams(request.params).path, services))
    .with("generate.queryStories", () => services.queryGenerateStories(generateQueryStoriesParams(request.params)))
    .with("generate.run", () => services.runGenerate(generateRunParams(request.params), signal))
    .with("preview.inspect", async () => {
      const { source } = inspectPreviewParams(request.params);
      const template = await resolvePreviewSource(source, services);
      return inspectTemplate(template);
    })
    .with("preview.mockStory", async () => {
      const { source, mockStory } = mockStoryPreviewParams(request.params);
      try { parseMockStory(mockStory); }
      catch (error) { throw Object.assign(new Error(getErrorMessage(error)), { code: "MOCK_STORY_INVALID" }); }
      const template = await resolvePreviewSource(source, services);
      return runPreview(template, mockStory);
    })
    .otherwise(method => { throw Object.assign(new Error(`Unknown method: ${method}`), { code: "METHOD_NOT_FOUND" }); });
}

export async function handleLine(line: string, services: SidecarServices): Promise<RpcResponse | undefined> {
  let value: unknown;
  try { value = JSON.parse(line); } catch { return { jsonrpc: "2.0", id: 0, error: { code: "PARSE_ERROR", message: "Request is not valid JSON." } }; }
  if (isCancellation(value)) {
    services.activeRequests.get(value.params.id)?.abort();
    return undefined;
  }
  if (!isRequest(value)) return { jsonrpc: "2.0", id: typeof (value as { id?: unknown }).id === "number" ? (value as { id: number }).id : 0, error: { code: "INVALID_REQUEST", message: "Request must include jsonrpc, numeric id, and method." } };
  const controller = new AbortController();
  services.activeRequests.set(value.id, controller);
  try {
    const result = await dispatch(value, services, controller.signal);
    return controller.signal.aborted ? undefined : { jsonrpc: "2.0", id: value.id, result };
  } catch (error) {
    return controller.signal.aborted ? undefined : { jsonrpc: "2.0", id: value.id, error: { code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "SIDECAR_REQUEST_FAILED", message: error instanceof Error ? error.message : "Sidecar request failed." } };
  } finally { services.activeRequests.delete(value.id); }
}

function isRequest(value: unknown): value is RpcRequest {
  return typeof value === "object" && value !== null && (value as RpcRequest).jsonrpc === "2.0" && typeof (value as RpcRequest).id === "number" && typeof (value as RpcRequest).method === "string";
}

function isCancellation(value: unknown): value is { jsonrpc: "2.0"; method: "$/cancelRequest"; params: { id: number } } {
  return typeof value === "object" && value !== null
    && (value as { jsonrpc?: unknown }).jsonrpc === "2.0"
    && (value as { method?: unknown }).method === "$/cancelRequest"
    && typeof (value as { params?: { id?: unknown } }).params?.id === "number";
}
