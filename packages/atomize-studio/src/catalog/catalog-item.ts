type CatalogItemBase = {
  name: string;
  displayName: string;
  description: string;
  scope: "builtin" | "user" | "project";
  content: unknown;
};

export type CatalogItem =
  | (CatalogItemBase & { kind: "template"; ref: `template:${string}` })
  | (CatalogItemBase & { kind: "mixin"; ref: `mixin:${string}` });

export function parseCatalogItems(value: unknown): CatalogItem[] {
  if (!Array.isArray(value)) throw new Error("Catalog response must be an array.");

  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => item.content !== undefined)
    .map((item) => {
      if (
        typeof item.name !== "string" ||
        typeof item.displayName !== "string" ||
        typeof item.description !== "string" ||
        typeof item.ref !== "string" ||
        (item.kind !== "template" && item.kind !== "mixin") ||
        !item.ref.startsWith(`${item.kind}:`) ||
        (item.scope !== "builtin" && item.scope !== "user" && item.scope !== "project")
      ) {
        throw new Error("Catalog response contains an invalid Catalog item.");
      }

      return {
        name: item.name,
        displayName: item.displayName,
        description: item.description,
        ref: item.ref,
        scope: item.scope,
        kind: item.kind,
        content: item.content,
      } as CatalogItem;
    });
}
