import { type TaskTemplate, TaskTemplateSchema } from "@sppg2001/atomize-schema";

/**
 * Turns a Catalog item's raw content into the flat Template shape the Authoring Store edits:
 * schema-parse, then drop the composition and lineage fields (`extends`, `mixins`, `origin`).
 *
 * Catalog Clone and the Template Diff baseline both build on this single transform so a
 * freshly created, unedited clone diffs as identical against its origin — see ADR-0058. If
 * clone ever gains real `extends`/`mixins` composition, changing it here keeps both paths
 * aligned.
 */
export function stripToAuthoredTemplate(content: unknown): TaskTemplate {
  const parsed = TaskTemplateSchema.parse(content);
  const { extends: _extends, mixins: _mixins, origin: _origin, ...flattened } = parsed;
  return TaskTemplateSchema.parse(flattened);
}
