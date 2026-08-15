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
): Promise<unknown> {
  try { return await call("catalog_install_item", { content, name, scope, overwrite }); }
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

export async function generateAIDraft(draftId: string, prose: string, grounding?: unknown, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("ai_generate", { draftId, prose, grounding }); }
  catch (error) { throw sidecarError(error); }
}

export async function cancelAIDraft(draftId: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("ai_cancel", { draftId }); }
  catch (error) { throw sidecarError(error); }
}

/** Resolves a local file's `extends`/`mixins` into a composed Template, so Open never has to strip them itself — see ADR-0048. */
export async function resolveLocalTemplate(path: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("template_resolve_local", { path }); }
  catch (error) { throw sidecarError(error); }
}

/** Inspects a Generate Area Preview Source (Catalog ref or local path), reporting which mock Story fields it references. */
export async function inspectPreview(source: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("preview_inspect", { source }); }
  catch (error) { throw sidecarError(error); }
}

/** Runs Mock Preview: resolves the Preview Source and evaluates it against mock Story field values (JSON string). */
export async function runMockPreview(source: string, mockStory: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("preview_mock_story", { source, mockStory }); }
  catch (error) { throw sidecarError(error); }
}

/** Fetches the real Stories a Generate Scope's Story browser can pick from — see ADR-0056. The frontend supplies only a profile name; Rust resolves and injects its token. */
export async function queryGenerateStories(source: string, profile: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("generate_query_stories", { source, profile }); }
  catch (error) { throw sidecarError(error); }
}

/** Runs Generate — one call for both Live Preview (`dryRun: true`) and Execute (`dryRun: false`), see ADR-0055. */
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

/** Best-effort cancellation of an active Generate run — Stories already sent to Azure DevOps are not rolled back. */
export async function cancelGenerate(runId: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("generate_cancel", { runId }); }
  catch (error) { throw sidecarError(error); }
}
