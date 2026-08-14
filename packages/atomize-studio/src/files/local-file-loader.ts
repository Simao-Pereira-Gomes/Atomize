import { type TaskTemplate, TaskTemplateSchema } from "@sppg2001/atomize-schema";
import { parse as parseYaml } from "yaml";
import { resolveLocalTemplate } from "../sidecar/sidecar-client";

export type LocalFileLoadResult =
  | { kind: "valid"; template: TaskTemplate }
  | { kind: "malformed"; template: TaskTemplate }
  | { kind: "wrong-format"; message: string };

export type LocalFileResolver = (path: string) => Promise<unknown>;

/** Raised when a file declaring extends/mixins can't be composed (companion process down, referenced file missing, circular inheritance) — distinct from wrong-format, since it says nothing about the picked file's own content. */
export class LocalFileResolutionError extends Error {
  override readonly name = "LocalFileResolutionError";
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function hasTemplateShape(value: Record<string, unknown>): boolean {
  return Array.isArray(value.tasks) && typeof value.name === "string" && typeof value.filter === "object" && value.filter !== null && !Array.isArray(value.filter);
}

function declaresComposition(value: Record<string, unknown>): boolean {
  const hasExtends = typeof value.extends === "string" && value.extends.trim() !== "";
  const hasMixins = Array.isArray(value.mixins) && value.mixins.length > 0;
  return hasExtends || hasMixins;
}

function stripComposition(value: Record<string, unknown>): Record<string, unknown> {
  const { extends: _extends, mixins: _mixins, ...flattened } = value;
  return flattened;
}

/**
 * Coerces a Template-shaped-but-invalid raw object into something the Authoring Store's
 * loadTemplate() can safely destructure. Do not replace with TaskTemplateSchema.parse: a
 * malformed local file must remain editable in Studio, matching ai-draft.ts's toAIDraftTemplate.
 */
function toLocalFileTemplate(value: Record<string, unknown>): TaskTemplate {
  const filter = record(value.filter);
  const metadata = record(value.metadata);
  const tasks = Array.isArray(value.tasks)
    ? value.tasks.map((task) => {
        const item = record(task);
        return { ...item, title: typeof item.title === "string" ? item.title : String(item.title ?? ""), estimationPercent: item.estimationPercent };
      })
    : [];
  return {
    ...value,
    version: typeof value.version === "string" ? value.version : String(value.version ?? "1.0"),
    name: typeof value.name === "string" ? value.name : String(value.name ?? ""),
    description: value.description === undefined ? undefined : String(value.description),
    author: value.author === undefined ? undefined : String(value.author),
    tags: strings(value.tags),
    filter: { ...filter, workItemTypes: strings(filter.workItemTypes), states: strings(filter.states), statesExclude: strings(filter.statesExclude), areaPaths: strings(filter.areaPaths), iterations: strings(filter.iterations), assignedTo: strings(filter.assignedTo) },
    tasks,
    metadata: value.metadata === undefined ? undefined : { ...metadata, category: metadata.category === undefined ? undefined : String(metadata.category), notes: metadata.notes === undefined ? undefined : String(metadata.notes), estimationGuidelines: metadata.estimationGuidelines === undefined ? undefined : String(metadata.estimationGuidelines) },
  } as TaskTemplate;
}

export async function loadLocalFile(raw: string, path: string, resolve: LocalFileResolver = (filePath) => resolveLocalTemplate(filePath)): Promise<LocalFileLoadResult> {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    return { kind: "wrong-format", message: "This file is not valid YAML." };
  }

  const shape = record(parsed);
  let effective = shape;

  if (declaresComposition(shape)) {
    // A template using extends/mixins may legitimately omit its own filter/tasks/name,
    // inheriting them from its parent — so the shape check below runs on the resolved
    // (composed) result instead of the raw file, not before resolution.
    let resolved: unknown;
    try {
      resolved = await resolve(path);
    } catch (error) {
      throw new LocalFileResolutionError(error instanceof Error ? error.message : "Could not resolve this template's extends/mixins.");
    }
    effective = stripComposition(record(resolved));
  }

  if (!hasTemplateShape(effective)) {
    return { kind: "wrong-format", message: "This file doesn't have the shape of an Atomize Template (a name, a filter, and at least one task)." };
  }

  const result = TaskTemplateSchema.safeParse(effective);
  if (result.success) return { kind: "valid", template: result.data };
  return { kind: "malformed", template: toLocalFileTemplate(effective) };
}
