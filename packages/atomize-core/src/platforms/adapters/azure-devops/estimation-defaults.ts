import type { EstimationDefaults } from "../../interfaces/estimation-defaults.interface";

/**
 * Covers the built-in processes: Agile (StoryPoints), Scrum (Effort), CMMI (Size),
 * with OriginalEstimate for Stories estimated directly in hours.
 */
export const AZURE_DEVOPS_ESTIMATION_DEFAULTS: EstimationDefaults = {
  storyEstimateFields: [
    "Microsoft.VSTS.Scheduling.StoryPoints",
    "Microsoft.VSTS.Scheduling.Effort",
    "Microsoft.VSTS.Scheduling.Size",
    "Microsoft.VSTS.Scheduling.OriginalEstimate",
  ],
  taskWorkItemType: "Task",
  taskEstimateFields: [
    "Microsoft.VSTS.Scheduling.RemainingWork",
    "Microsoft.VSTS.Scheduling.OriginalEstimate",
  ],
  unitLabel: "hours",
  nonEstimateFields: [
    "Microsoft.VSTS.Common.StackRank",
    "Microsoft.VSTS.Common.BacklogPriority",
    "Microsoft.VSTS.Common.BusinessValue",
    "Microsoft.VSTS.Common.TimeCriticality",
  ],
};
