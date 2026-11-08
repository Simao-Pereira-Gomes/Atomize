import { Atomizer } from "../core/atomizer";
import {
  extractCustomFieldRefs,
  extractStandardFieldRefs,
} from "../core/condition-evaluator";
import { MockStoryPlatform } from "../platforms/adapters/mock/mock-story.platform";
import type { WorkItem } from "../platforms/interfaces/work-item.interface";
import type { FilterCriteria, TaskTemplate } from "./schema";

export type InspectFieldType = "string" | "number" | "boolean" | "string[]" | "unknown";
export type InspectFieldSource = "filter" | "condition" | "estimation";

export interface InspectField {
  name: string;
  type: InspectFieldType;
  sources: InspectFieldSource[];
  required?: boolean;
}

export interface InspectResult {
  fields: InspectField[];
}

export interface PreviewTask {
  title: string;
  /** Absent when the Story Estimate is unresolvable and the Task Estimate is left blank. */
  estimation?: number;
  estimationPercent?: number;
  dependsOn?: string[];
  tags?: string[];
  priority?: number;
  activity?: string;
}

export interface PreviewSkippedTask {
  title: string;
  reason: string;
}

export interface PreviewResult {
  tasks: PreviewTask[];
  skippedTasks: PreviewSkippedTask[];
  /** Unit of the Task Estimates when they go to the platform's default fields; absent when unknown. */
  estimateUnit?: string;
  /** Why the Story Estimate could not be resolved, and whether Tasks were left blank or the Story skipped. */
  unresolvedEstimate?: { action: "blank" | "skip"; reason: string };
  estimationSummary: {
    storyEstimation: number;
    totalTaskEstimation: number;
    percentageUsed: number;
  };
}

const STANDARD_FIELD_TYPES: Record<string, InspectFieldType> = {
  id: "string",
  title: "string",
  type: "string",
  state: "string",
  assignedTo: "string",
  estimation: "number",
  tags: "string[]",
  description: "string",
  areaPath: "string",
  iteration: "string",
  priority: "number",
};

function filterToWorkItemFields(filter: FilterCriteria): string[] {
  const fields: string[] = [];
  if (filter.tags?.include?.length || filter.tags?.exclude?.length) fields.push("tags");
  if (filter.workItemTypes?.length) fields.push("type");
  if (
    filter.states?.length ||
    filter.statesExclude?.length ||
    filter.statesWereEver?.length
  )
    fields.push("state");
  if (filter.assignedTo?.length) fields.push("assignedTo");
  if (filter.priority?.min !== undefined || filter.priority?.max !== undefined)
    fields.push("priority");
  return fields;
}

export function inspectTemplate(template: TaskTemplate): InspectResult {
  const conditionStandardFields = new Set<string>();
  const conditionCustomFields = new Set<string>();

  for (const task of template.tasks) {
    const conditions = [
      task.condition,
      ...(task.estimationPercentCondition?.map((r) => r.condition) ?? []),
    ].filter((c): c is NonNullable<typeof c> => c != null);

    for (const cond of conditions) {
      for (const f of extractStandardFieldRefs(cond)) conditionStandardFields.add(f);
      for (const f of extractCustomFieldRefs(cond)) conditionCustomFields.add(f);
    }
  }

  const filterFields = filterToWorkItemFields(template.filter);
  const fieldMap = new Map<string, { type: InspectFieldType; sources: Set<InspectFieldSource>; required: boolean }>();

  function upsert(
    name: string,
    type: InspectFieldType,
    source: InspectFieldSource,
    options: { required?: boolean } = {},
  ): void {
    const entry = fieldMap.get(name);
    if (entry) {
      entry.sources.add(source);
      entry.required = entry.required || options.required === true;
    } else {
      fieldMap.set(name, {
        type,
        sources: new Set([source]),
        required: options.required === true,
      });
    }
  }

  if (template.tasks.some((task) => task.estimationPercent !== undefined || task.estimationPercentCondition?.length)) {
    const source = template.estimation?.source;
    if (source) upsert(source, "unknown", "estimation", { required: true });
    else upsert("estimation", "number", "estimation", { required: true });
  }

  for (const name of filterFields) {
    upsert(name, STANDARD_FIELD_TYPES[name] ?? "unknown", "filter");
  }
  for (const name of conditionStandardFields) {
    const topLevel = name.split(".")[0] ?? name;
    upsert(name, STANDARD_FIELD_TYPES[topLevel] ?? "unknown", "condition");
  }
  for (const name of conditionCustomFields) {
    upsert(name, "unknown", "condition");
  }

  return {
    fields: Array.from(fieldMap.entries()).map(([name, { type, sources, required }]) => ({
      name,
      type,
      sources: Array.from(sources),
      ...(required ? { required: true } : {}),
    })),
  };
}

const MOCK_DEFAULTS = {
  id: "mock",
  title: "Mock Story",
  type: "User Story" as const,
  state: "Active",
};

export function parseMockStory(json: string): WorkItem {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid mock story JSON: ${(e as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Mock story must be a JSON object, not an array or primitive");
  }

  return { ...MOCK_DEFAULTS, ...(parsed as Record<string, unknown>) } as WorkItem;
}

/**
 * Mock Preview: a dry Generation Run of the Template against the Mock Story, so it produces
 * the same Tasks, skipped Tasks and estimates a Live Preview of the same Story would.
 */
export async function runPreview(template: TaskTemplate, mockStoryJson: string): Promise<PreviewResult> {
  const story = parseMockStory(mockStoryJson);
  const report = await new Atomizer(new MockStoryPlatform(story)).atomize(template, {
    dryRun: true,
    storyIds: [story.id],
  });
  const result = report.results[0];
  if (!result) {
    throw new Error("Mock Preview did not process the Mock Story.");
  }
  if (!result.success) {
    throw new Error(result.error ?? "Mock Preview failed.");
  }

  const tasks: PreviewTask[] = result.tasksCalculated.map((task) => {
    const preview: PreviewTask = { title: task.title };
    if (task.estimation !== undefined) preview.estimation = task.estimation;
    if (task.estimationPercent !== undefined) preview.estimationPercent = task.estimationPercent;
    if (task.dependsOn?.length) preview.dependsOn = task.dependsOn;
    if (task.tags?.length) preview.tags = task.tags;
    if (task.priority !== undefined) preview.priority = task.priority;
    if (task.activity !== undefined) preview.activity = task.activity;
    return preview;
  });

  return {
    tasks,
    skippedTasks: (result.tasksSkipped ?? []).map((skipped) => ({
      title: skipped.templateTask.title,
      reason: skipped.reason,
    })),
    ...(result.unresolvedEstimate ? { unresolvedEstimate: result.unresolvedEstimate } : {}),
    ...(result.estimateUnit ? { estimateUnit: result.estimateUnit } : {}),
    estimationSummary: {
      storyEstimation: result.estimationSummary?.storyEstimation ?? 0,
      totalTaskEstimation: result.estimationSummary?.totalTaskEstimation ?? 0,
      percentageUsed: result.estimationSummary?.percentageUsed ?? 0,
    },
  };
}
