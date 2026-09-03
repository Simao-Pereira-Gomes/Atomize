import type { TaskTemplate } from "@sppg2001/atomize-schema";
import type { Accessor } from "solid-js";
import { stripToAuthoredTemplate } from "../catalog/authored-template";
import { type CatalogItem, parseCatalogItems } from "../catalog/catalog-item";
import { listCatalogItems } from "../sidecar/sidecar-client";

type CatalogTemplate = Extract<CatalogItem, { kind: "template" }>;

export type OriginBaseline =
  | { status: "resolved"; template: TaskTemplate; item: CatalogTemplate }
  | { status: "not-in-catalog"; ref: string };

export type CatalogItemsLoader = () => Promise<unknown>;

/**
 * Resolves a Template's `origin` ref to the diff baseline by matching it against the Catalog
 * (via the existing `catalog.list` sidecar call — no dedicated RPC, see ADR-0058). Returns
 * `not-in-catalog` when the origin Template was removed or renamed; propagates the underlying
 * error when the Catalog can't be fetched at all (companion process recovering).
 */
export async function loadOriginBaseline(
  origin: string,
  load: CatalogItemsLoader = listCatalogItems,
): Promise<OriginBaseline> {
  const items = parseCatalogItems(await load());
  const match = items.find(
    (item): item is CatalogTemplate => item.kind === "template" && item.ref === origin,
  );
  if (!match) return { status: "not-in-catalog", ref: origin };
  return { status: "resolved", template: stripToAuthoredTemplate(match.content), item: match };
}

/**
 * The Template Diff baseline as held in the authoring session. Fetched once per `origin`
 * (via `catalog.list`, see ADR-0058) and cached until a new Starting Path replaces the
 * Authoring Store; a manual Refresh forces a re-fetch.
 */
export type OriginBaselineState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "resolved"; ref: string; baseline: TaskTemplate }
  | { phase: "not-in-catalog"; ref: string }
  | { phase: "error"; message: string };

export type OriginBaselineSession = {
  state: Accessor<OriginBaselineState>;
  /** Loads the baseline for `origin` unless it is already loaded or loading for that same ref. */
  ensure: (origin: string) => void;
  /** Forces a re-fetch of the baseline for `origin`. */
  refresh: (origin: string) => void;
};

/** The recorded lineage `origin`, but only when it names a Catalog Template — the Template Diff's precondition (ADR-0058). */
export function catalogTemplateOrigin(origin: unknown): string | undefined {
  return typeof origin === "string" && origin.startsWith("template:") ? origin : undefined;
}

/** Whether `ensure(ref)` should start a fetch, or the session already holds (or is loading) that ref's baseline. */
export function shouldLoadBaseline(state: OriginBaselineState, ref: string): boolean {
  if (state.phase === "loading") return false;
  if ((state.phase === "resolved" || state.phase === "not-in-catalog") && state.ref === ref) return false;
  return true;
}
