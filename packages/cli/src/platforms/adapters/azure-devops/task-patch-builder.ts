import type { TaskDefinition } from "@platforms/interfaces/work-item.interface";
import type { JsonPatchDocument } from "azure-devops-node-api/interfaces/common/VSSInterfaces";

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
      value,
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
