import type { WorkItem, WorkItemType } from "@platforms/interfaces/work-item.interface";
import type {
  WorkItem as AzureWorkItem,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";

export function convertWorkItem(azureItem: AzureWorkItem): WorkItem {
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
    type: fields["System.WorkItemType"] as WorkItemType,
    state: fields["System.State"] || "",
    assignedTo:
      fields["System.AssignedTo"]?.uniqueName ||
      fields["System.AssignedTo"]?.displayName,
    estimation:
      fields["Microsoft.VSTS.Scheduling.StoryPoints"] ||
      fields["Microsoft.VSTS.Scheduling.OriginalEstimate"],
    tags: fields["System.Tags"] ? fields["System.Tags"].split("; ") : [],
    description: fields["System.Description"],
    areaPath: fields["System.AreaPath"],
    iteration: fields["System.IterationPath"],
    priority: fields["Microsoft.VSTS.Common.Priority"],
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
  if (!workItem.relations || workItem.relations.length === 0) {
    return false;
  }
  return workItem.relations.some(
    (rel) => rel.rel === "System.LinkTypes.Hierarchy-Forward",
  );
}
