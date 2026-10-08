import { describe, expect, test } from "bun:test";
import { convertWorkItem } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/work-item-mapper";

function storyWith(fields: Record<string, unknown>) {
  return convertWorkItem({ id: 1, fields: { "System.Title": "S", "System.WorkItemType": "User Story", ...fields } });
}

describe("convertWorkItem Story Estimate fallback chain", () => {
  test("reads StoryPoints on Agile Stories", () => {
    expect(storyWith({ "Microsoft.VSTS.Scheduling.StoryPoints": 5 }).estimation).toBe(5);
  });

  test("reads Effort on Scrum Product Backlog Items", () => {
    expect(storyWith({ "Microsoft.VSTS.Scheduling.Effort": 8 }).estimation).toBe(8);
  });

  test("reads Size on CMMI Requirements", () => {
    expect(storyWith({ "Microsoft.VSTS.Scheduling.Size": 13 }).estimation).toBe(13);
  });

  test("falls back to OriginalEstimate, as on Tasks", () => {
    expect(storyWith({ "Microsoft.VSTS.Scheduling.OriginalEstimate": 6 }).estimation).toBe(6);
  });

  test("prefers the earliest field in the chain", () => {
    const story = storyWith({
      "Microsoft.VSTS.Scheduling.StoryPoints": 3,
      "Microsoft.VSTS.Scheduling.Effort": 8,
      "Microsoft.VSTS.Scheduling.OriginalEstimate": 20,
    });
    expect(story.estimation).toBe(3);
  });

  test("treats a zero StoryPoints as missing, as before", () => {
    const story = storyWith({
      "Microsoft.VSTS.Scheduling.StoryPoints": 0,
      "Microsoft.VSTS.Scheduling.OriginalEstimate": 4,
    });
    expect(story.estimation).toBe(4);
  });

  test("leaves the estimation undefined when no chain field has a value", () => {
    expect(storyWith({}).estimation).toBeUndefined();
  });
});
