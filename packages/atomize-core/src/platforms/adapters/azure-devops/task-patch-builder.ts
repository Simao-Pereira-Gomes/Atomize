import type { TaskDefinition } from "../../interfaces/work-item.interface";

/** A Work Item relation, as a patch adds it. */
export interface RelationValue {
  rel: string;
  url: string;
  attributes: { comment: string };
}

/** A Work Item field value a Task patch writes. */
export type FieldValue = string | number | boolean;

/** One operation of a Task's create or link patch: Atomize only ever adds. */
export interface AddOperation {
  op: "add";
  path: string;
  value: FieldValue | RelationValue;
}

/** A JSON Patch document for a Task. The SDK types a patch as an opaque object; this is its real shape. */
export type TaskPatch = AddOperation[];

const DATE_MACRO_RE =
  /^(@Today|@StartOfDay|@StartOfMonth|@StartOfWeek|@StartOfYear)(?:\s*([+-])\s*(\d+))?$/i;

/**
 * Resolves a date macro (see atomize-schema's DateOrMacroSchema) into the literal date a
 * Task custom field value needs. WIQL query filters (changedAfter/createdAfter) send these
 * macros to Azure DevOps as-is and let it resolve them server-side (see
 * work-item-query.ts's formatDateMacro); a direct field write on task creation has no such
 * resolution step, so it has to happen locally, at generation time, right before the patch
 * is built — otherwise the literal string "@Today" would be sent as the field's value.
 */
export function resolveDateMacro(value: FieldValue): FieldValue {
  if (typeof value !== "string") return value;
  const match = DATE_MACRO_RE.exec(value.trim());
  if (!match) return value;
  const [, macro, sign, amountStr] = match;
  if (!macro) return value;
  const offsetDays = amountStr ? (sign === "-" ? -1 : 1) * Number(amountStr) : 0;
  const now = new Date();
  let base: Date;
  switch (macro.toLowerCase()) {
    case "@today":
    case "@startofday":
      base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "@startofweek":
      base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      break;
    case "@startofmonth":
      base = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      base = new Date(now.getFullYear(), 0, 1);
      break;
  }
  base.setDate(base.getDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

export interface TaskEstimateWrite {
  fields: readonly string[];
  /** New Tasks start with no completed work; only written alongside the default estimate fields. */
  initializeCompletedWork?: boolean;
}

/** Sets Work Item field `referenceName` to `value`. */
function setField(referenceName: string, value: FieldValue): AddOperation {
  return { op: "add", path: `/fields/${referenceName}`, value };
}

/** Adds a `rel` relation to Work Item `targetId`. */
function addRelation(organizationUrl: string, rel: string, targetId: number | string, comment: string): AddOperation {
  return { op: "add", path: "/relations/-", value: { rel, url: `${organizationUrl}/_apis/wit/workItems/${targetId}`, attributes: { comment } } };
}

export function buildCreateTaskPatch(
  organizationUrl: string,
  parentId: number,
  task: TaskDefinition,
  estimateWrite: TaskEstimateWrite,
): TaskPatch {
  const { estimation } = task;
  return [
    setField("System.Title", task.title),
    ...(task.description ? [setField("System.Description", task.description)] : []),
    ...(estimation !== undefined ? estimateWrite.fields.map((field) => setField(field, estimation)) : []),
    ...(estimateWrite.initializeCompletedWork ? [setField("Microsoft.VSTS.Scheduling.CompletedWork", 0)] : []),
    ...(task.iteration ? [setField("System.IterationPath", task.iteration)] : []),
    ...(task.areaPath ? [setField("System.AreaPath", task.areaPath)] : []),
    ...(task.tags && task.tags.length > 0 ? [setField("System.Tags", task.tags.join("; "))] : []),
    ...(task.assignTo ? [setField("System.AssignedTo", task.assignTo)] : []),
    ...(task.priority !== undefined ? [setField("Microsoft.VSTS.Common.Priority", task.priority)] : []),
    ...(task.activity ? [setField("Microsoft.VSTS.Common.Activity", task.activity)] : []),
    ...Object.entries(task.customFields ?? {}).map(([referenceName, value]) => setField(referenceName, resolveDateMacro(value))),
    addRelation(organizationUrl, "System.LinkTypes.Hierarchy-Reverse", parentId, "Parent link"),
    ...(task.predecessorIds ?? []).flatMap((predecessorId) => buildDependencyLinkPatch(organizationUrl, predecessorId)),
  ];
}

export function buildDependencyLinkPatch(
  organizationUrl: string,
  predecessorId: number | string,
): TaskPatch {
  return [addRelation(organizationUrl, "System.LinkTypes.Dependency-Reverse", predecessorId, "Predecessor dependency")];
}
