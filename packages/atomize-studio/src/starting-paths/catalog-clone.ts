import { type TaskTemplate, TaskTemplateSchema } from "@sppg2001/atomize-schema";
import type { CatalogItem } from "../catalog/catalog-item";

export function toCatalogClone(item: Extract<CatalogItem, { kind: "template" }>): TaskTemplate {
  const resolved = TaskTemplateSchema.parse(item.content);
  const { extends: _extends, mixins: _mixins, origin: _origin, ...flattened } = resolved;

  return TaskTemplateSchema.parse({
    ...flattened,
    origin: item.ref,
  });
}
