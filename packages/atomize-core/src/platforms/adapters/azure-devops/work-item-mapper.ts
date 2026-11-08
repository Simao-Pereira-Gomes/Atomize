import type {
  WorkItem as AzureWorkItem,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import type { StoryEstimate, WorkItem, WorkItemType } from "../../interfaces/work-item.interface";
import { AZURE_DEVOPS_ESTIMATION_DEFAULTS } from "./estimation-defaults";

// Falsy values (0, "") fall through, matching the original StoryPoints || OriginalEstimate behaviour.
function firstEstimate(fields: Record<string, unknown>): StoryEstimate | undefined {
  for (const field of AZURE_DEVOPS_ESTIMATION_DEFAULTS.storyEstimateFields) {
    const value = fields[field];
    if ((typeof value === "number" || typeof value === "string") && value) return value;
  }
  return undefined;
}

/**
 * The Work Item's web link: the `_links.html` Azure DevOps returned, or, for a fetch that didn't ask
 * for links (WorkItemExpand.Relations), the same edit URL built from the organization and its project.
 */
function webUrl(azureItem: AzureWorkItem, organizationUrl: string | undefined): string | undefined {
  const href = azureItem._links?.html?.href;
  if (typeof href === "string") return href;
  const project = azureItem.fields?.["System.TeamProject"];
  if (!organizationUrl || typeof project !== "string" || azureItem.id === undefined) return undefined;
  return `${organizationUrl.replace(/\/+$/, "")}/${encodeURIComponent(project)}/_workitems/edit/${azureItem.id}`;
}

export function convertWorkItem(azureItem: AzureWorkItem, organizationUrl?: string): WorkItem {
  const fields = azureItem.fields || {};

  const predecessorIds: string[] = [];
  const successorIds: string[] = [];

  if (azureItem.relations) {
    for (const relation of azureItem.relations) {
      const url = relation.url || "";
      const match = url.match(/\/(\d+)$/);
      const relatedId = match?.[1];

      if (relatedId) {
        if (relation.rel === "System.LinkTypes.Dependency-Reverse") {
          predecessorIds.push(relatedId);
        }
        if (relation.rel === "System.LinkTypes.Dependency-Forward") {
          successorIds.push(relatedId);
        }
      }
    }
  }

  return {
    id: azureItem.id?.toString() || "",
    title: fields["System.Title"] || "",
    url: webUrl(azureItem, organizationUrl),
    type: fields["System.WorkItemType"] as WorkItemType,
    state: fields["System.State"] || "",
    assignedTo:
      fields["System.AssignedTo"]?.uniqueName ||
      fields["System.AssignedTo"]?.displayName,
    estimation: firstEstimate(fields),
    tags: fields["System.Tags"] ? fields["System.Tags"].split("; ") : [],
    description: fields["System.Description"],
    areaPath: fields["System.AreaPath"],
    iteration: fields["System.IterationPath"],
    priority: fields["Microsoft.VSTS.Common.Priority"],
    childCount: countChildRelations(azureItem),
    predecessorIds: predecessorIds.length > 0 ? predecessorIds : undefined,
    successorIds: successorIds.length > 0 ? successorIds : undefined,
    customFields: fields,
    createdDate: fields["System.CreatedDate"]
      ? new Date(fields["System.CreatedDate"])
      : undefined,
    updatedDate: fields["System.ChangedDate"]
      ? new Date(fields["System.ChangedDate"])
      : undefined,
    platformSpecific: {
      url: azureItem.url,
      rev: azureItem.rev,
      relations: azureItem.relations,
    },
  };
}

export function hasChildRelations(workItem: AzureWorkItem): boolean {
  return countChildRelations(workItem) > 0;
}

export function countChildRelations(workItem: AzureWorkItem): number {
  return (workItem.relations ?? []).filter(
    (rel) => rel.rel === "System.LinkTypes.Hierarchy-Forward",
  ).length;
}
