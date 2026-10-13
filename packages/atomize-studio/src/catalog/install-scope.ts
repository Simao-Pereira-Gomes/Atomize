import type { CatalogInstallScope } from "../sidecar/sidecar-client";

const KEY = "atomize.studio.catalogInstallScope";

type ScopeStorage = Pick<Storage, "getItem" | "setItem">;

const browserStorage = (): ScopeStorage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * The Catalog scope Studio's Install starts on: the one last installed to on this machine, so a
 * team that installs to its project Catalog doesn't switch away from Personal every time. Storage
 * can be missing or refuse access, so this falls back to Personal and never throws.
 */
export function rememberedInstallScope(storage: ScopeStorage | undefined = browserStorage()): CatalogInstallScope {
  try {
    return storage?.getItem(KEY) === "project" ? "project" : "user";
  } catch {
    return "user";
  }
}

export function rememberInstallScope(scope: CatalogInstallScope, storage: ScopeStorage | undefined = browserStorage()): void {
  try {
    storage?.setItem(KEY, scope);
  } catch {
    // Not remembering is harmless: the next Install starts on Personal.
  }
}
