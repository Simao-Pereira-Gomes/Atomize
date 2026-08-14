import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type SidecarInvoker = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
const tauriInvoke: SidecarInvoker = invoke;

export type AIDraftProgress = { draftId: string; length: number };

/** Live progress for a running AI draft, forwarded from the sidecar's streaming response. */
export async function listenAIDraftProgress(onProgress: (progress: AIDraftProgress) => void): Promise<UnlistenFn> {
  return listen<AIDraftProgress>("ai-draft-progress", (event) => onProgress(event.payload));
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
export async function listCatalogTemplates(): Promise<unknown> {
  return await invoke("catalog_list_templates");
}

/** The frontend supplies only a profile name; Rust resolves and injects its token. */
export async function loadGrounding(profile: string, call: SidecarInvoker = tauriInvoke): Promise<unknown> {
  try { return await call("grounding_load", { profile }); }
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
