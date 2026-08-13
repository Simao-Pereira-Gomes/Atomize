import type { AuthoringSectionId, Errors, SectionStores } from "../stores/sections";

const FILLED_DEFAULTS = new Set(["", "percentage", "none", "1.0", "build"]);
const OPTIONAL_DEFAULT_READY_SECTIONS = new Set<AuthoringSectionId>(["estimation", "validation"]);

type StoreView = { errors: Errors; isValid: () => boolean; fields: Record<string, unknown> };

function storeView(stores: SectionStores, id: AuthoringSectionId): StoreView {
  return stores[id] as unknown as StoreView;
}

export function sectionFields(stores: SectionStores, id: AuthoringSectionId): Record<string, unknown> {
  return storeView(stores, id).fields;
}

export function sectionFilledCount(stores: SectionStores, id: AuthoringSectionId): number {
  return countFilledFields(sectionFields(stores, id));
}

export function usesDefaultSectionSettings(stores: SectionStores, id: AuthoringSectionId): boolean {
  return (
    OPTIONAL_DEFAULT_READY_SECTIONS.has(id) &&
    sectionFilledCount(stores, id) === 0 &&
    storeView(stores, id).isValid()
  );
}

export function sectionStatus(stores: SectionStores, id: AuthoringSectionId): "ok" | "warn" | "neutral" {
  const section = storeView(stores, id);
  if (Object.values(section.errors).some(Boolean)) return "warn";
  if (
    section.isValid() &&
    (sectionFilledCount(stores, id) > 0 || usesDefaultSectionSettings(stores, id))
  ) {
    return "ok";
  }
  return "neutral";
}

function countFilledFields(fields: Record<string, unknown>): number {
  return Object.values(fields).filter((value) =>
    Array.isArray(value)
      ? value.length > 0
      : typeof value === "boolean"
        ? false
        : !FILLED_DEFAULTS.has(value as string),
  ).length;
}
