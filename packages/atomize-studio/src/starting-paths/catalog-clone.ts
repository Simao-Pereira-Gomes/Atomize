import { type TaskTemplate, TaskTemplateSchema } from "@sppg2001/atomize-schema";
import { stripToAuthoredTemplate } from "../catalog/authored-template";
import type { CatalogItem } from "../catalog/catalog-item";

export function toCatalogClone(item: Extract<CatalogItem, { kind: "template" }>): TaskTemplate {
  return TaskTemplateSchema.parse({ ...stripToAuthoredTemplate(item.content), origin: item.ref });
}
