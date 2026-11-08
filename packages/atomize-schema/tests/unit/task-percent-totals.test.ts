import { describe, expect, test } from "bun:test";
import { totalUnconditionalEstimationPercent } from "../../src/schema";

describe("totalUnconditionalEstimationPercent", () => {
  test("adds up the percent of Tasks without a condition, counting each repeated copy", () => {
    expect(totalUnconditionalEstimationPercent([
      { estimationPercent: 40 },
      { estimationPercent: 10, repeat: 3 },
      { estimationPercent: 50, condition: { field: "tags", operator: "contains", value: "ui" } },
      {},
    ])).toBe(70);
  });
});
