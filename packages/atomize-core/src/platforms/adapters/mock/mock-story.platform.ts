import type { EstimationDefaults } from "../../interfaces/estimation-defaults.interface";
import type { FilterCriteria } from "../../interfaces/filter.interface";
import type { GenerationPlatform } from "../../interfaces/platform-capabilities";
import type { WorkItem } from "../../interfaces/work-item.interface";

/** Mock Stories carry their Story Estimate in the platform-free `estimation` property. */
export const MOCK_ESTIMATION_DEFAULTS: EstimationDefaults = {
  storyEstimateFields: ["estimation"],
  taskWorkItemType: "Task",
  taskEstimateFields: ["estimation"],
  unitLabel: "hours",
};

/**
 * A Generation Platform holding exactly one Mock Story. Mock Preview is a dry run against it,
 * so it computes Tasks through the same Generation Run as Live Preview. It never creates Tasks.
 */
export class MockStoryPlatform implements GenerationPlatform {
  constructor(private readonly story: WorkItem) {}

  async getConnectUserEmail(): Promise<string> {
    return "";
  }

  async queryWorkItems(filter: FilterCriteria): Promise<WorkItem[]> {
    return filter.workItemIds?.includes(this.story.id) ? [this.story] : [];
  }

  getEstimationDefaults(): EstimationDefaults {
    return MOCK_ESTIMATION_DEFAULTS;
  }

  async createTasksBulk(): Promise<WorkItem[]> {
    throw new Error("Mock Preview never creates Tasks.");
  }
}
