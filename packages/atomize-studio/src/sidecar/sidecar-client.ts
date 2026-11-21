import type { GenerateScope, SidecarNotifications, SidecarResult } from "@sppg2001/atomize-sidecar/contract";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { type Ending, observed } from "../telemetry/telemetry";

const count = (value: number | undefined): number => Math.max(0, Math.min(1_000_000, Math.trunc(value ?? 0)));
const documentCount = (grounding: unknown): number => {
  const documents = (grounding as { documents?: unknown[] } | null | undefined)?.documents;
  return Array.isArray(documents) ? count(documents.length) : 0;
};

export type SidecarInvoker = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
const tauriInvoke: SidecarInvoker = invoke;

export type AIDraftProgress = SidecarNotifications["ai.progress"];
export type OnlineValidationResult = SidecarResult<"validation.online">;
export type OnlineValidationDiagnostic = OnlineValidationResult["errors"][number];

/** Live progress for a running AI draft, forwarded from the sidecar's streaming response. */
export async function listenAIDraftProgress(onProgress: (progress: AIDraftProgress) => void): Promise<UnlistenFn> {
  return listen<AIDraftProgress>("ai-draft-progress", (event) => onProgress(event.payload));
}

export type GenerateRunProgress = SidecarNotifications["generate.progress"];

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
export async function listCatalogItems(): Promise<SidecarResult<"catalog.list">> {
  return await observed("catalog.list", {}, () => invoke("catalog_list_items"));
}

export async function removeCatalogItem(kind: "template" | "mixin", name: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await observed("catalog.remove", { scope: "user" }, () => call("catalog_remove_item", { kind, name })); }
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
): Promise<SidecarResult<"catalog.install">> {
  try { return await observed("catalog.install", { scope }, () => call<SidecarResult<"catalog.install">>("catalog_install_item", { content, name, scope, overwrite, ...(workspaceRoot ? { workspaceRoot } : {}) })); }
  catch (error) { throw sidecarError(error); }
}

/** The frontend supplies only a profile name; Rust resolves and injects its token. */
export async function loadGrounding(profile: string, call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"grounding.fetch">> {
  try { return await call("grounding_load", { profile }); }
  catch (error) { throw sidecarError(error); }
}

/** Runs Core's Online Validation with a Rust-injected credential; the webview never sees a token. */
export async function validateOnline(validationId: string, template: unknown, profile: string, call: SidecarInvoker = tauriInvoke): Promise<OnlineValidationResult> {
  try {
    return await observed(
      "validate",
      (result: OnlineValidationResult | undefined) => ({ mode: "online" as const, valid: result?.valid ?? false, issueCount: count((result?.errors.length ?? 0) + (result?.warnings.length ?? 0)) }),
      () => call<OnlineValidationResult>("validation_online", { validationId, template, profile }),
    );
  }
  catch (error) { throw sidecarError(error); }
}

/** Best-effort cancellation of an active Online Validation request. */
export async function cancelOnlineValidation(validationId: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("validation_cancel", { validationId }); }
  catch (error) { throw sidecarError(error); }
}

export async function generateAIDraft(draftId: string, prose: string, grounding?: unknown, documentGrounding?: unknown, call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"ai.generate">> {
  try {
    return await observed(
      "template.create",
      { mode: "ai", grounded: grounding != null, referenceDocCount: documentCount(documentGrounding) },
      () => call<SidecarResult<"ai.generate">>("ai_generate", { draftId, prose, grounding, documentGrounding }),
    );
  }
  catch (error) { throw sidecarError(error); }
}

export async function listReferences(startPath: string, call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"references.list">> {
  try { return await call("references_list", { startPath }); }
  catch (error) { throw sidecarError(error); }
}

export async function saveReference(workspaceRoot: string, entry: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("references_save", { workspaceRoot, entry }); }
  catch (error) { throw sidecarError(error); }
}

export async function loadReferences(workspaceRoot: string, entries: string[], profile?: string, call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"references.load">> {
  try { return await call("references_load", { workspaceRoot, entries, profile: profile || null }); }
  catch (error) { throw sidecarError(error); }
}

export async function listWikis(profile: string, call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"wiki.list">> {
  try { return await call("wiki_list", { profile }); }
  catch (error) { throw sidecarError(error); }
}

export async function listWikiPages(profile: string, wiki: string, call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"wiki.pages">> {
  try { return await call("wiki_pages", { profile, wiki }); }
  catch (error) { throw sidecarError(error); }
}

/** Asks Copilot for a Template Improvement of the open Template; progress and cancellation share the AI draft channel. */
export async function improveTemplateWithAI(
  draftId: string,
  template: unknown,
  guidance?: string,
  grounding?: { project?: unknown; documents?: unknown },
  call: SidecarInvoker = tauriInvoke,
): Promise<SidecarResult<"ai.improve">> {
  try {
    return await observed(
      "template.improve",
      { grounded: grounding?.project != null, referenceDocCount: documentCount(grounding?.documents) },
      () => call<SidecarResult<"ai.improve">>("ai_improve", {
        draftId,
        template,
        guidance: guidance?.trim() || null,
        grounding: grounding?.project ?? null,
        documentGrounding: grounding?.documents ?? null,
      }),
    );
  } catch (error) { throw sidecarError(error); }
}

export async function cancelAIDraft(draftId: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("ai_cancel", { draftId }); }
  catch (error) { throw sidecarError(error); }
}

export async function checkCopilotAuthStatus(call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"ai.authStatus">> {
  try { return await call("ai_auth_status"); }
  catch (error) { throw sidecarError(error); }
}

export async function resolveLocalTemplate(path: string, call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"template.resolveLocal">> {
  try { return await observed("template.resolve", {}, () => call<SidecarResult<"template.resolveLocal">>("template_resolve_local", { path })); }
  catch (error) { throw sidecarError(error); }
}

export async function inspectPreview(source: string, call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"preview.inspect">> {
  try { return await observed("preview", { variant: "inspect" }, () => call<SidecarResult<"preview.inspect">>("preview_inspect", { source })); }
  catch (error) { throw sidecarError(error); }
}

export async function runMockPreview(source: string, mockStory: string, call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"preview.mockStory">> {
  try { return await observed("preview", { variant: "mock-story" }, () => call<SidecarResult<"preview.mockStory">>("preview_mock_story", { source, mockStory })); }
  catch (error) { throw sidecarError(error); }
}

/** `withTasks` lists Stories that already have Tasks too, to pick Partly Created Stories to finish. */
export async function queryGenerateStories(source: string, profile: string, withTasks = false, call: SidecarInvoker = tauriInvoke): Promise<SidecarResult<"generate.queryStories">> {
  try { return await call("generate_query_stories", { source, profile, withTasks }); }
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
): Promise<SidecarResult<"generate.run">> {
  try {
    const props = (result: SidecarResult<"generate.run"> | undefined) => {
      const report = result?.report;
      return {
        mode: dryRun ? "dry-run" as const : "execute" as const,
        output: "human" as const,
        continueOnError,
        storyCount: count(report?.storiesProcessed),
        taskCount: count(dryRun ? report?.tasksCalculated : report?.tasksCreated),
        failedStoryCount: count(report?.storiesFailed),
      };
    };
    const endingOf = (result: SidecarResult<"generate.run">): Ending => {
      const report = result?.report;
      if (!report) return { outcome: "success" };
      return report.stopped
        ? report.stopped.reason === "timedOut" ? { outcome: "failure", errorCategory: "timeout" } : { outcome: "cancelled" }
        : report.storiesFailed > 0 ? { outcome: "failure" } : { outcome: "success" };
    };
    const run = () => call<SidecarResult<"generate.run">>("generate_run", { runId, source, profile, dryRun, scope, continueOnError });
    return scope.kind === "stories" && scope.resume === true
      ? await observed("generate.resume", props, run, endingOf)
      : await observed("generate", props, run, endingOf);
  }
  catch (error) { throw sidecarError(error); }
}

export async function cancelGenerate(runId: string, call: SidecarInvoker = tauriInvoke): Promise<void> {
  try { await call("generate_cancel", { runId }); }
  catch (error) { throw sidecarError(error); }
}
