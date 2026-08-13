import { type TaskTemplate, TaskTemplateSchema } from "@sppg2001/atomize-schema";

export type CatalogTemplateItem = {
  name: string;
  displayName: string;
  description: string;
  ref: `template:${string}`;
  scope: "builtin" | "user" | "project";
  kind: "template";
  template: unknown;
};

export function toCatalogClone(item: CatalogTemplateItem): TaskTemplate {
  const resolved = TaskTemplateSchema.parse(item.template);
  const { extends: _extends, mixins: _mixins, origin: _origin, ...flattened } = resolved;

  return TaskTemplateSchema.parse({
    ...flattened,
    origin: item.ref,
  });
}

export function parseCatalogTemplates(value: unknown): CatalogTemplateItem[] {
  if (!Array.isArray(value)) throw new Error("Catalog response must be an array.");

  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => item.kind === "template" && item.template !== undefined)
    .map((item) => {
      if (
        typeof item.name !== "string" ||
        typeof item.displayName !== "string" ||
        typeof item.description !== "string" ||
        typeof item.ref !== "string" ||
        !item.ref.startsWith("template:") ||
        (item.scope !== "builtin" && item.scope !== "user" && item.scope !== "project")
      ) {
        throw new Error("Catalog response contains an invalid Template item.");
      }

      return {
        name: item.name,
        displayName: item.displayName,
        description: item.description,
        ref: item.ref as `template:${string}`,
        scope: item.scope,
        kind: "template",
        template: item.template,
      };
    });
}
