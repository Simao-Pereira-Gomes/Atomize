import {
  extractCustomFieldRefs,
  extractStandardFieldRefs,
} from "@sppg2001/atomize-core/core/condition-evaluator";
import { DependencyResolver } from "@sppg2001/atomize-core/core/dependency-resolver";
import { EstimationCalculator } from "@sppg2001/atomize-core/core/estimation-calculator";
import type { WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import type { FilterCriteria, TaskTemplate } from "@sppg2001/atomize-core/templates/schema";

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
  estimation: number;
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
    upsert("estimation", "number", "estimation", { required: true });
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
    throw new Error(`Invalid --mock-story JSON: ${(e as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("--mock-story must be a JSON object, not an array or primitive");
  }

  return { ...MOCK_DEFAULTS, ...(parsed as Record<string, unknown>) } as WorkItem;
}

export function runPreview(template: TaskTemplate, mockStoryJson: string): PreviewResult {
  const story = parseMockStory(mockStoryJson);
  const orderedTasks = new DependencyResolver().resolveDependencies(template.tasks);
  const calc = new EstimationCalculator();

  const { calculatedTasks, skippedTasks } = calc.calculateTasksWithSkipped(
    story,
    "",
    orderedTasks,
    template.estimation,
  );

  const summary = calc.getEstimationSummary(story, calculatedTasks);

  const tasks: PreviewTask[] = calculatedTasks.map((task) => {
    const result: PreviewTask = {
      title: task.title,
      estimation: task.estimation ?? 0,
    };
    if (task.estimationPercent !== undefined) result.estimationPercent = task.estimationPercent;
    if (task.dependsOn?.length) result.dependsOn = task.dependsOn;
    if (task.tags?.length) result.tags = task.tags;
    if (task.priority !== undefined) result.priority = task.priority;
    if (task.activity !== undefined) result.activity = task.activity;
    return result;
  });

  return {
    tasks,
    skippedTasks: skippedTasks.map((s) => ({
      title: s.templateTask.title,
      reason: s.reason,
    })),
    estimationSummary: {
      storyEstimation: summary.storyEstimation,
      totalTaskEstimation: summary.totalTaskEstimation,
      percentageUsed: summary.percentageUsed,
    },
  };
}
