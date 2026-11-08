import { describe, expect, test } from "bun:test";
import { isNativelyManagedTaskField, NATIVELY_MANAGED_TASK_FIELDS } from "../../src/task-fields";

describe("natively managed Task fields", () => {
  test("covers the fields Atomize or Azure DevOps already set on a Task", () => {
    expect([...NATIVELY_MANAGED_TASK_FIELDS].sort()).toEqual([
      "Microsoft.VSTS.Common.Activity",
      "Microsoft.VSTS.Common.Priority",
      "Microsoft.VSTS.Scheduling.CompletedWork",
      "Microsoft.VSTS.Scheduling.OriginalEstimate",
      "Microsoft.VSTS.Scheduling.RemainingWork",
      "System.AreaPath",
      "System.AssignedTo",
      "System.AuthorizedAs",
      "System.AuthorizedDate",
      "System.ChangedBy",
      "System.ChangedDate",
      "System.CreatedBy",
      "System.CreatedDate",
      "System.Description",
      "System.Id",
      "System.IterationPath",
      "System.Rev",
      "System.State",
      "System.Tags",
      "System.TeamProject",
      "System.Title",
      "System.Watermark",
      "System.WorkItemType",
    ]);
  });

  test("leaves custom fields to the Template", () => {
    expect(isNativelyManagedTaskField("System.Title")).toBe(true);
    expect(isNativelyManagedTaskField("Custom.ClientTier")).toBe(false);
  });
});
