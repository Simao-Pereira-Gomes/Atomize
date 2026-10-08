import { describe, expect, test } from "bun:test";
import { inferEstimation, taskEstimateShares } from "@sppg2001/atomize-core/core/estimation-inference";

describe("taskEstimateShares", () => {
  test("is each Task's share of its own Story's total, whatever the units", () => {
    expect(taskEstimateShares([3, 3, 4])).toEqual([30, 30, 40]);
  });

  test("treats missing Task Estimates as zero", () => {
    expect(taskEstimateShares([2, undefined, 2])).toEqual([50, 0, 50]);
  });

  test("returns zeros when the Story's Tasks have no estimates", () => {
    expect(taskEstimateShares([0, undefined])).toEqual([0, 0]);
  });
});

describe("inferEstimation", () => {
  test("learns a table of median totals for categorical Story Estimates", () => {
    const learned = inferEstimation([
      { storyEstimate: "L", taskEstimates: [2, 3] },
      { storyEstimate: "L", taskEstimates: [6] },
      { storyEstimate: "L", taskEstimates: [10, 10] },
      { storyEstimate: "S", taskEstimates: [1, 1] },
    ]);
    expect(learned.conversion).toEqual({ table: { L: 6, S: 2 } });
  });

  test("flags table values learned from a single Story", () => {
    const learned = inferEstimation([
      { storyEstimate: "L", taskEstimates: [5] },
      { storyEstimate: "L", taskEstimates: [6] },
      { storyEstimate: "XL", taskEstimates: [13] },
    ]);
    expect(learned.lowConfidenceValues).toEqual(["XL"]);
  });

  test("learns a median factor for numeric Story Estimates", () => {
    const learned = inferEstimation([
      { storyEstimate: 5, taskEstimates: [10, 10] },
      { storyEstimate: 3, taskEstimates: [12] },
      { storyEstimate: 8, taskEstimates: [40] },
    ]);
    expect(learned.conversion).toEqual({ factor: 4 });
    expect(learned.lowConfidenceValues).toEqual([]);
  });

  test("omits the conversion when Task totals already match the Story Estimates", () => {
    const learned = inferEstimation([
      { storyEstimate: 5, taskEstimates: [2, 3] },
      { storyEstimate: 8, taskEstimates: [8] },
    ]);
    expect(learned.conversion).toBeUndefined();
  });

  test("uses the most common Story Estimate as the default", () => {
    const learned = inferEstimation([
      { storyEstimate: "M", taskEstimates: [4] },
      { storyEstimate: "L", taskEstimates: [5] },
      { storyEstimate: "M", taskEstimates: [4] },
    ]);
    expect(learned.defaultStoryEstimate).toBe("M");
  });

  test("ignores Stories with no estimate or no estimated Tasks", () => {
    const learned = inferEstimation([
      { storyEstimate: undefined, taskEstimates: [8] },
      { storyEstimate: "XL", taskEstimates: [0, undefined] },
      { storyEstimate: "M", taskEstimates: [4] },
    ]);
    expect(learned.conversion).toEqual({ table: { M: 4 } });
    expect(learned.defaultStoryEstimate).toBe("M");
  });

  test("learns nothing when no Story is usable", () => {
    expect(inferEstimation([{ taskEstimates: [1] }])).toEqual({ lowConfidenceValues: [] });
  });
});
