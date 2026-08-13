import { listAzureDevOpsProfiles as listNativeAzureDevOpsProfiles, type AzureDevOpsProfile } from "../connections/connection-client";
import { loadGrounding, SidecarRequestError, type SidecarInvoker } from "../sidecar/sidecar-client";

export type { AzureDevOpsProfile } from "../connections/connection-client";

export type SavedQuery = { id: string; path: string };

export type GroundedTaskField = {
  referenceName: string;
  name: string;
  type: "string" | "integer" | "decimal" | "boolean" | "identity" | "datetime";
  isCustom: boolean;
  isReadOnly: boolean;
  isMultiline: boolean;
  isPicklist: boolean;
  allowedValues?: string[];
};

export type GroundedFieldOptions = {
  workItemTypes: string[];
  statesByWorkItemType: Record<string, string[]>;
  areaPaths: string[];
  iterationPaths: string[];
  teams: string[];
  savedQueries: SavedQuery[];
  taskFields: GroundedTaskField[];
  fieldsByWorkItemType: Record<string, GroundedTaskField[]>;
};

/**
 * Fields the Task editor already authors through dedicated controls or that Azure
 * DevOps owns itself. Keep this aligned with the CLI custom-field picker so a
 * connected project offers the same safe set of Task fields in both surfaces.
 */
const NATIVELY_MANAGED_TASK_FIELDS = new Set([
  "System.Title", "System.State", "System.WorkItemType", "System.TeamProject",
  "System.AreaPath", "System.IterationPath", "System.AssignedTo", "System.Tags",
  "System.Description", "System.Id", "System.Rev", "System.CreatedBy",
  "System.CreatedDate", "System.ChangedBy", "System.ChangedDate",
  "System.AuthorizedAs", "System.AuthorizedDate", "System.Watermark",
  "Microsoft.VSTS.Scheduling.RemainingWork",
  "Microsoft.VSTS.Scheduling.OriginalEstimate",
  "Microsoft.VSTS.Scheduling.CompletedWork", "Microsoft.VSTS.Common.Priority",
  "Microsoft.VSTS.Common.Activity",
]);

/** Fields that can safely be added through a Template Task's customFields map. */
export function editableTaskFields(options: GroundedFieldOptions | undefined): GroundedTaskField[] {
  return (options?.taskFields ?? []).filter(
    (field) => !field.isReadOnly && !NATIVELY_MANAGED_TASK_FIELDS.has(field.referenceName),
  );
}

/**
 * The connected project's Activity picklist (Microsoft.VSTS.Common.Activity), if grounded.
 * Excluded from editableTaskFields since the Task editor authors it through its own
 * dedicated "Activity" control rather than the generic custom-fields list.
 */
export function activityField(options: GroundedFieldOptions | undefined): GroundedTaskField | undefined {
  return options?.taskFields.find((field) => field.referenceName === "Microsoft.VSTS.Common.Activity");
}

// Datetime fields are authored as a plain "YYYY-MM-DD" date (no time-of-day) or as one of
// the @Today/@StartOfWeek/@StartOfMonth/@StartOfYear macros that custom-field-verifier.ts
// validates — both pass through unchanged rather than being parsed into a Date, since the
// macro forms aren't valid Date input and resolving them is a generation-time concern.
export function coerceGroundedTaskValue(field: GroundedTaskField, value: string): string | number | boolean {
  if (field.type === "boolean") return value === "true";
  if (field.type === "integer" || field.type === "decimal") return Number(value);
  return value;
}

/** Fields available to conditions on the selected parent Story work-item types. */
export function conditionFields(options: GroundedFieldOptions | undefined, workItemTypes: string[]): GroundedTaskField[] {
  const types = workItemTypes.length > 0 ? workItemTypes : Object.keys(options?.fieldsByWorkItemType ?? {});
  const typeFields = types.flatMap((type) => options?.fieldsByWorkItemType[type] ?? []);
  const fields = typeFields.length > 0 ? typeFields : options?.taskFields ?? [];
  return [...new Map(fields.filter((field) => !field.isReadOnly).map((field) => [field.referenceName, field])).values()]
    .sort((left, right) => Number(right.isCustom) - Number(left.isCustom) || left.name.localeCompare(right.name));
}

export class ProjectConnectionError extends Error {
  override readonly name = "ProjectConnectionError";
  constructor(message = "We couldn’t connect to that Azure DevOps project. Check the project settings and try again.") {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function taskFields(value: unknown): GroundedTaskField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((field) => {
    if (!isRecord(field) || typeof field.referenceName !== "string" || typeof field.name !== "string") return [];
    const type = field.type;
    if (!["string", "integer", "decimal", "boolean", "identity", "datetime"].includes(String(type))) return [];
    return [{
      referenceName: field.referenceName,
      name: field.name,
      type: type as GroundedTaskField["type"],
      isCustom: field.isCustom === true,
      isReadOnly: field.isReadOnly === true,
      isMultiline: field.isMultiline === true,
      isPicklist: field.isPicklist === true,
      allowedValues: strings(field.allowedValues).length > 0 ? strings(field.allowedValues) : undefined,
    }];
  });
}

export function parseGroundedFieldOptions(value: unknown): GroundedFieldOptions {
  if (!isRecord(value)) throw new Error("CLI returned invalid template grounding metadata.");
  const rawStates = isRecord(value.statesByWorkItemType) ? value.statesByWorkItemType : {};
  const statesByWorkItemType = Object.fromEntries(
    Object.entries(rawStates).map(([type, states]) => [type, strings(states)]),
  );
  const savedQueries = Array.isArray(value.savedQueries)
    ? value.savedQueries.flatMap((query) =>
      isRecord(query) && typeof query.id === "string" && typeof query.path === "string"
        ? [{ id: query.id, path: query.path }]
        : [],
    )
    : [];
  const rawFieldsByWorkItemType = isRecord(value.fieldsByWorkItemType) ? value.fieldsByWorkItemType : {};
  const fieldsByWorkItemType = Object.fromEntries(
    Object.entries(rawFieldsByWorkItemType).map(([type, fields]) => [type, taskFields(fields)]),
  );
  return {
    workItemTypes: strings(value.workItemTypes),
    statesByWorkItemType,
    areaPaths: strings(value.areaPaths),
    iterationPaths: strings(value.iterationPaths),
    teams: strings(value.teams),
    savedQueries,
    taskFields: taskFields(value.taskFields),
    fieldsByWorkItemType,
  };
}

export async function listAzureDevOpsProfiles(): Promise<AzureDevOpsProfile[]> {
  return await listNativeAzureDevOpsProfiles();
}

export async function loadGroundedFieldOptions(profile: string, call?: SidecarInvoker): Promise<GroundedFieldOptions> {
  try {
    return parseGroundedFieldOptions(await loadGrounding(profile, call));
  } catch (error) {
    if (error instanceof SidecarRequestError) throw new ProjectConnectionError(error.message);
    throw error;
  }
}

export function statesForTypes(options: GroundedFieldOptions | undefined, types: string[]): string[] {
  const typesToInclude = types.length > 0 ? types : Object.keys(options?.statesByWorkItemType ?? {});
  return [...new Set(typesToInclude.flatMap((type) => options?.statesByWorkItemType[type] ?? []))].sort();
}
