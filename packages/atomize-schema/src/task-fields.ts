/**
 * Task fields Atomize already sets itself (title, estimates, priority, activity, assignment, tags,
 * description, area and iteration) or that Azure DevOps owns (identity and audit fields). They are
 * not offered as a Task's `customFields`, so a Template can't set them twice.
 */
export const NATIVELY_MANAGED_TASK_FIELDS: ReadonlySet<string> = new Set([
  // Core identity and structure, set on creation
  "System.Title",
  "System.State",
  "System.WorkItemType",
  "System.TeamProject",
  "System.AreaPath",
  "System.IterationPath",
  "System.AssignedTo",
  "System.Tags",
  "System.Description",
  // Audit fields, owned by Azure DevOps
  "System.Id",
  "System.Rev",
  "System.CreatedBy",
  "System.CreatedDate",
  "System.ChangedBy",
  "System.ChangedDate",
  "System.AuthorizedAs",
  "System.AuthorizedDate",
  "System.Watermark",
  // Set by Atomize from the Template's own Task settings
  "Microsoft.VSTS.Scheduling.RemainingWork",
  "Microsoft.VSTS.Scheduling.OriginalEstimate",
  "Microsoft.VSTS.Scheduling.CompletedWork",
  "Microsoft.VSTS.Common.Priority",
  "Microsoft.VSTS.Common.Activity",
]);

export function isNativelyManagedTaskField(referenceName: string): boolean {
  return NATIVELY_MANAGED_TASK_FIELDS.has(referenceName);
}
