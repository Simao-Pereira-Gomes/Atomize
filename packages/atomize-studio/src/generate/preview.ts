export type PreviewFieldType = "string" | "number" | "boolean" | "string[]" | "unknown";
export type PreviewFieldSource = "filter" | "condition" | "estimation";
export type PreviewField = { name: string; type: PreviewFieldType; sources: PreviewFieldSource[]; required?: boolean };
export type InspectResult = { fields: PreviewField[] };

export function parseInspectResult(value: unknown): InspectResult {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { fields?: unknown }).fields)) {
    throw new Error("Atomize Studio received an unexpected response while inspecting this Template.");
  }
  return value as InspectResult;
}

export type PreviewTask = { title: string; estimation: number; estimationPercent?: number; dependsOn?: string[]; tags?: string[]; priority?: number; activity?: string };
export type PreviewSkippedTask = { title: string; reason: string };
export type PreviewResult = {
  tasks: PreviewTask[];
  skippedTasks: PreviewSkippedTask[];
  estimationSummary: { storyEstimation: number; totalTaskEstimation: number; percentageUsed: number };
};

/** Presentation-only formatting: preserves over-allocation while avoiding floating-point noise. */
export function formatAllocationPercentage(value: number): string {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

type ConditionDescription = { field?: unknown; customField?: unknown; operator?: unknown; value?: unknown; all?: unknown; any?: unknown };
const OPERATOR_WORDS: Record<string, string> = { equals: "is", "not-equals": "is not", contains: "includes", "not-contains": "does not include", gt: "is greater than", gte: "is at least", lt: "is less than", lte: "is at most" };

function describeCondition(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const condition = value as ConditionDescription;
  if (Array.isArray(condition.all)) {
    const parts = condition.all.map(describeCondition).filter((part): part is string => !!part);
    return parts.length ? `all of these must match: ${parts.join("; ")}` : undefined;
  }
  if (Array.isArray(condition.any)) {
    const parts = condition.any.map(describeCondition).filter((part): part is string => !!part);
    return parts.length ? `at least one of these must match: ${parts.join("; ")}` : undefined;
  }
  const field = typeof condition.field === "string" ? condition.field : typeof condition.customField === "string" ? condition.customField : undefined;
  const operator = typeof condition.operator === "string" ? OPERATOR_WORDS[condition.operator] : undefined;
  if (!field || !operator || !(typeof condition.value === "string" || typeof condition.value === "number" || typeof condition.value === "boolean")) return undefined;
  return `${field} ${operator} “${condition.value}”`;
}

/** Turns the engine's serialized conditional result into a concise explanation for Studio. */
export function describeSkippedTaskReason(reason: string): string {
  const prefix = "Condition not met: ";
  if (!reason.startsWith(prefix)) return "Atomize could not include this Task because its condition could not be evaluated.";
  try {
    const description = describeCondition(JSON.parse(reason.slice(prefix.length)));
    return description ? `The Mock Story did not satisfy this rule: ${description}.` : "The Mock Story did not satisfy this Task’s rule.";
  } catch { return "The Mock Story did not satisfy this Task’s rule."; }
}

export function parsePreviewResult(value: unknown): PreviewResult {
  if (
    typeof value !== "object" || value === null
    || !Array.isArray((value as { tasks?: unknown }).tasks)
    || !Array.isArray((value as { skippedTasks?: unknown }).skippedTasks)
  ) {
    throw new Error("Atomize Studio received an unexpected response while running Mock Preview.");
  }
  return value as PreviewResult;
}

/** The Template a user has picked to run Mock Preview against — see CONTEXT.md's "Preview Source". */
export type PreviewSource = { kind: "catalog"; ref: `template:${string}`; displayName: string } | { kind: "file"; path: string };

export function previewSourceValue(source: PreviewSource): string {
  return source.kind === "catalog" ? source.ref : source.path;
}

export function previewSourceLabel(source: PreviewSource): string {
  return source.kind === "catalog" ? source.displayName : source.path.split(/[\\/]/).filter(Boolean).at(-1) ?? source.path;
}

export function previewSourceDetail(source: PreviewSource): string {
  if (source.kind === "catalog") return `Catalog · ${source.ref}`;
  const segments = source.path.split(/[\\/]/).filter(Boolean);
  return `Local file · ${segments.slice(-2).join("/")}`;
}

/** Converts the mock-Story form's raw per-field text into the typed JSON string `preview.mockStory` expects. */
export function buildMockStoryJson(fields: PreviewField[], values: Record<string, string>): string {
  const story: Record<string, unknown> = {};
  const customFields: Record<string, string | number | boolean | string[]> = {};
  const setValue = (field: PreviewField, value: string | number | boolean | string[]) => {
    // Custom Azure DevOps references (e.g. Custom.DataClassification) are nested
    // on WorkItem.customFields, even though Studio presents them as a flat form field.
    if (field.name.includes(".")) customFields[field.name] = value;
    else story[field.name] = value;
  };
  for (const field of fields) {
    const raw = values[field.name];
    if (raw === undefined || raw === "") continue;
    if (field.type === "number") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) setValue(field, parsed);
    } else if (field.type === "boolean") {
      setValue(field, raw === "true");
    } else if (field.type === "string[]") {
      const items = raw.split(",").map((item) => item.trim()).filter(Boolean);
      if (items.length > 0) setValue(field, items);
    } else {
      setValue(field, raw);
    }
  }
  if (Object.keys(customFields).length > 0) story.customFields = customFields;
  return JSON.stringify(story);
}
