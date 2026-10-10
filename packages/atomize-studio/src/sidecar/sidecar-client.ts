import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { GenerateScope } from "../generate/live-execution-confirmation";

export type SidecarInvoker = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
const tauriInvoke: SidecarInvoker = invoke;

export type AIDraftProgress = { draftId: string; length: number };
export type OnlineValidationDiagnostic = { path: string; message: string; code?: string };
export type OnlineValidationResult = {
  valid: boolean;
  errors: OnlineValidationDiagnostic[];
  warnings: OnlineValidationDiagnostic[];
  mode: "lenient" | "strict";
  requirements: { customFieldTaskCount: number; conditionFieldRefs: string[]; hasSavedQuery: boolean; needsOnlineVerification: boolean };
};

/** Live progress for a running AI draft, forwarded from the sidecar's streaming response. */
export async function listenAIDraftProgress(onProgress: (progress: AIDraftProgress) => void): Promise<UnlistenFn> {
  return listen<AIDraftProgress>("ai-draft-progress", (event) => onProgress(event.payload));
}

export type GenerateRunProgress = { runId: string; event: unknown };

/** Live progress for a running Generate call (Live Preview or Execute), forwarded from atomize-core's ProgressEvent stream. */
export async function listenGenerateProgress(onProgress: (progress: GenerateRunProgress) => void): Promise<UnlistenFn> {
  return listen<GenerateRunProgress>("generate-run-progress", (event) => onProgress(event.payload));
}

export class SidecarRequestError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "SidecarRequestError"; }
}

function sidecarError(error: unknown): SidecarRequestError {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error && typeof error.code === "string" && typeof error.message === "string") {
    return new SidecarRequestError(error.code, error.message);
  }
  return new SidecarRequestError("SIDECAR_REQUEST_FAILED", error instanceof Error ? error.message : "We could not get project choices right now.");
}

/** The sole frontend seam for calls handled by Atomize Studio's companion process. */
export async function listCatalogItems(): Promise<unknown> {
  return await invoke("catalog_list_items");
}

export async function removeCatalogItem(kind: "template" | "mixin", name: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("catalog_remove_item", { kind, name }); }
  catch (error) { throw sidecarError(error); }
}

export type CatalogInstallScope = "user" | "project";

/** Installs in-memory YAML content (no file path or URL) into the Catalog — see ADR-0052. */
export async function installCatalogItem(
  content: string,
  name: string,
  scope: CatalogInstallScope,
  overwrite = false,
  call: SidecarInvoker = tauriInvoke,
  workspaceRoot?: string,
): Promise<unknown> {
  try { return await call("catalog_install_item", { content, name, scope, overwrite, ...(workspaceRoot ? { workspaceRoot } : {}) }); }
  catch (error) { throw sidecarError(error); }
}

/** The frontend supplies only a profile name; Rust resolves and injects its token. */
export async function loadGrounding(profile: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("grounding_load", { profile }); }
  catch (error) { throw sidecarError(error); }
}

/** Runs Core's Online Validation with a Rust-injected credential; the webview never sees a token. */
export async function validateOnline(validationId: string, template: unknown, profile: string, call: SidecarInvoker = tauriInvoke): Promise<OnlineValidationResult> {
  try { return await call("validation_online", { validationId, template, profile }); }
  catch (error) { throw sidecarError(error); }
}

/** Best-effort cancellation of an active Online Validation request. */
export async function cancelOnlineValidation(validationId: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("validation_cancel", { validationId }); }
  catch (error) { throw sidecarError(error); }
}

export async function generateAIDraft(draftId: string, prose: string, grounding?: unknown, storyGrounding?: unknown, documentGrounding?: unknown, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("ai_generate", { draftId, prose, grounding, storyGrounding, documentGrounding }); }
  catch (error) { throw sidecarError(error); }
}

export async function listReferences(startPath: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("references_list", { startPath }); }
  catch (error) { throw sidecarError(error); }
}

export async function saveReference(workspaceRoot: string, entry: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("references_save", { workspaceRoot, entry }); }
  catch (error) { throw sidecarError(error); }
}

export async function loadReferences(workspaceRoot: string, entries: string[], profile?: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("references_load", { workspaceRoot, entries, profile: profile || null }); }
  catch (error) { throw sidecarError(error); }
}

export async function listWikis(profile: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("wiki_list", { profile }); }
  catch (error) { throw sidecarError(error); }
}

export async function listWikiPages(profile: string, wiki: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("wiki_pages", { profile, wiki }); }
  catch (error) { throw sidecarError(error); }
}

/** Runs a Story Search for the Story Browser's Search mode; Rust injects the profile's token. */
export async function searchStories(profile: string, search: unknown, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("stories_search", { profile, search }); }
  catch (error) { throw sidecarError(error); }
}

/** Loads Story Grounding for chosen Stories; descriptions and acceptance criteria only when opted in. */
export async function loadStoryGrounding(profile: string, storyIds: string[], includeSensitive: boolean, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("story_grounding_load", { profile, storyIds, includeSensitive }); }
  catch (error) { throw sidecarError(error); }
}

/** Asks Copilot for a Template Improvement of the open Template; progress and cancellation share the AI draft channel. */
export async function improveTemplateWithAI(
  draftId: string,
  template: unknown,
  guidance?: string,
  grounding?: { project?: unknown; stories?: unknown; documents?: unknown },
  call: SidecarInvoker = tauriInvoke,
): Promise<unknown> {
  try {
    return await call("ai_improve", {
      draftId,
      template,
      guidance: guidance?.trim() || null,
      grounding: grounding?.project ?? null,
      storyGrounding: grounding?.stories ?? null,
      documentGrounding: grounding?.documents ?? null,
    });
  } catch (error) { throw sidecarError(error); }
}

export async function listAppliedStories(profile: string, templateFilter: unknown, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("stories_applied", { profile, templateFilter }); }
  catch (error) { throw sidecarError(error); }
}

export async function cancelAIDraft(draftId: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("ai_cancel", { draftId }); }
  catch (error) { throw sidecarError(error); }
}

export async function checkCopilotAuthStatus(call: SidecarInvoker = tauriInvoke): Promise<{ authenticated: boolean }> {
  try { return await call("ai_auth_status"); }
  catch (error) { throw sidecarError(error); }
}

export async function resolveLocalTemplate(path: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("template_resolve_local", { path }); }
  catch (error) { throw sidecarError(error); }
}

export async function inspectPreview(source: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("preview_inspect", { source }); }
  catch (error) { throw sidecarError(error); }
}

export async function runMockPreview(source: string, mockStory: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("preview_mock_story", { source, mockStory }); }
  catch (error) { throw sidecarError(error); }
}

export async function queryGenerateStories(source: string, profile: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("generate_query_stories", { source, profile }); }
  catch (error) { throw sidecarError(error); }
}

export async function runGenerate(
  runId: string,
  source: string,
  profile: string,
  dryRun: boolean,
  scope: GenerateScope,
  continueOnError = false,
  call: SidecarInvoker = tauriInvoke,
): Promise<unknown> {
  try { return await call("generate_run", { runId, source, profile, dryRun, scope, continueOnError }); }
  catch (error) { throw sidecarError(error); }
}

export async function cancelGenerate(runId: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("generate_cancel", { runId }); }
  catch (error) { throw sidecarError(error); }
}
