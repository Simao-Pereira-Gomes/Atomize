import { invoke } from "@tauri-apps/api/core";

/** The sole frontend seam for calls handled by Atomize Studio's companion process. */
export async function listCatalogTemplates(): Promise<unknown> {
  return await invoke("catalog_list_templates");
}
