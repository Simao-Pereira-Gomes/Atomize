import type { TaskTemplate } from "@sppg2001/atomize-schema";

export type AIDraftResponse = { template: Record<string, unknown> };

function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : []; }

/**
 * Maps the sidecar's intentionally non-strict Template object to the fields the
 * Authoring Store owns. Do not replace this with TaskTemplateSchema.parse: an AI
 * draft with field errors must remain editable in Studio.
 */
export function toAIDraftTemplate(value: unknown): TaskTemplate {
  const raw = record(value);
  const filter = record(raw.filter);
  const metadata = record(raw.metadata);
  const tasks = Array.isArray(raw.tasks) ? raw.tasks.map((task) => {
    const item = record(task);
    return { ...item, title: typeof item.title === "string" ? item.title : String(item.title ?? ""), estimationPercent: item.estimationPercent };
  }) : [];
  return {
    ...raw,
    version: typeof raw.version === "string" ? raw.version : String(raw.version ?? ""),
    name: typeof raw.name === "string" ? raw.name : String(raw.name ?? ""),
    description: raw.description === undefined ? undefined : String(raw.description),
    author: raw.author === undefined ? undefined : String(raw.author),
    tags: strings(raw.tags),
    filter: { ...filter, workItemTypes: strings(filter.workItemTypes), states: strings(filter.states), statesExclude: strings(filter.statesExclude), areaPaths: strings(filter.areaPaths), iterations: strings(filter.iterations), assignedTo: strings(filter.assignedTo) },
    tasks,
    metadata: raw.metadata === undefined ? undefined : { ...metadata, category: metadata.category === undefined ? undefined : String(metadata.category), notes: metadata.notes === undefined ? undefined : String(metadata.notes), estimationGuidelines: metadata.estimationGuidelines === undefined ? undefined : String(metadata.estimationGuidelines) },
  } as TaskTemplate;
}

export function parseAIDraftResponse(value: unknown): TaskTemplate {
  const response = record(value);
  if (!("template" in response)) throw new Error("AI draft response did not contain a Template.");
  return toAIDraftTemplate(response.template);
}
