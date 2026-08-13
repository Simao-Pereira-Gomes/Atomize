import { invoke } from "@tauri-apps/api/core";

export type SidecarInvoker = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
const tauriInvoke: SidecarInvoker = invoke;

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
