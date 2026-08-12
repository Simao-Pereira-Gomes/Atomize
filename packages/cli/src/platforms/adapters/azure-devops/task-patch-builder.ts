import type { TaskDefinition } from "@platforms/interfaces/work-item.interface";
import type { JsonPatchDocument } from "azure-devops-node-api/interfaces/common/VSSInterfaces";

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
export function resolveDateMacro(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const match = DATE_MACRO_RE.exec(value.trim());
  if (!match) return value;
  const [, macro, sign, amountStr] = match;
  const offsetDays = amountStr ? (sign === "-" ? -1 : 1) * Number(amountStr) : 0;
  const now = new Date();
  let base: Date;
  switch (macro!.toLowerCase()) {
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

export function buildCreateTaskPatch(
  organizationUrl: string,
  parentId: number,
  task: TaskDefinition,
): JsonPatchDocument {
  return [
    {
      op: "add",
      path: "/fields/System.Title",
      value: task.title,
    },
    ...(task.description
      ? [
          {
            op: "add",
            path: "/fields/System.Description",
            value: task.description,
          },
        ]
      : []),
    ...(task.estimation !== undefined
      ? [
          {
            op: "add",
            path: "/fields/Microsoft.VSTS.Scheduling.RemainingWork",
            value: task.estimation,
          },
          {
            op: "add",
            path: "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate",
            value: task.estimation,
          },
        ]
      : []),
    ...(task.completedWork !== undefined
      ? [
          {
            op: "add",
            path: "/fields/Microsoft.VSTS.Scheduling.CompletedWork",
            value: task.completedWork,
          },
        ]
      : []),
    ...(task.iteration
      ? [
          {
            op: "add",
            path: "/fields/System.IterationPath",
            value: task.iteration,
          },
        ]
      : []),
    ...(task.areaPath
      ? [
          {
            op: "add",
            path: "/fields/System.AreaPath",
            value: task.areaPath,
          },
        ]
      : []),
    ...(task.tags && task.tags.length > 0
      ? [
          {
            op: "add",
            path: "/fields/System.Tags",
            value: task.tags.join("; "),
          },
        ]
      : []),
    ...(task.assignTo
      ? [
          {
            op: "add",
            path: "/fields/System.AssignedTo",
            value: task.assignTo,
          },
        ]
      : []),
    ...(task.priority !== undefined
      ? [
          {
            op: "add",
            path: "/fields/Microsoft.VSTS.Common.Priority",
            value: task.priority,
          },
        ]
      : []),
    ...(task.activity
      ? [
          {
            op: "add",
            path: "/fields/Microsoft.VSTS.Common.Activity",
            value: task.activity,
          },
        ]
      : []),
    ...Object.entries(task.customFields ?? {}).map(([referenceName, value]) => ({
      op: "add" as const,
      path: `/fields/${referenceName}`,
      value: resolveDateMacro(value),
    })),
    {
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `${organizationUrl}/_apis/wit/workItems/${parentId}`,
        attributes: {
          comment: "Parent link",
        },
      },
    },
  ];
}

export function buildDependencyLinkPatch(
  organizationUrl: string,
  predecessorId: number,
): JsonPatchDocument {
  return [
    {
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Dependency-Reverse",
        url: `${organizationUrl}/_apis/wit/workItems/${predecessorId}`,
        attributes: {
          comment: "Predecessor dependency",
        },
      },
    },
  ];
}
