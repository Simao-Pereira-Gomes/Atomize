import { describe, expect, it } from "vitest";
import { previewEstimation } from "../estimation-preview";

const tasks = [
  { title: "Build", percent: 70 },
  { title: "Review", percent: 20 },
  { title: "Docs", percent: 10 },
];

describe("previewEstimation", () => {
  it("converts through a table, splits by percentage and applies rounding and the minimum", () => {
    const result = previewEstimation("L", tasks, {
      conversion: { table: { L: 5 } },
      rounding: "nearest",
      minimumTaskEstimate: 0.5,
    });
    expect(result).toEqual({
      kind: "estimated",
      total: 5,
      usedDefault: false,
      tasks: [
        { title: "Build", percent: 70, hours: 3.5 },
        { title: "Review", percent: 20, hours: 1 },
        { title: "Docs", percent: 10, hours: 0.5 },
      ],
    });
  });

  it("supports factors, one-to-one numbers and fractional sizes", () => {
    expect(previewEstimation("5", tasks, { conversion: { factor: 4 } })).toMatchObject({ total: 20 });
    expect(previewEstimation("8", tasks, {})).toMatchObject({ total: 8 });
    expect(previewEstimation("0.3XL", tasks, { conversion: { table: { XL: 5 }, multipliers: true } })).toMatchObject({ total: 1.5 });
  });

  it("follows the unresolvable-estimate policy", () => {
    expect(previewEstimation("XXL", tasks, { conversion: { table: { L: 5 } } })).toEqual({ kind: "blank", tasks });
    expect(previewEstimation("XXL", tasks, { conversion: { table: { L: 5 } }, ifParentHasNoEstimation: "skip" })).toEqual({ kind: "skipped" });
    expect(
      previewEstimation("XXL", tasks, {
        conversion: { table: { L: 5 } },
        ifParentHasNoEstimation: "use-default",
        defaultParentEstimation: "L",
      }),
    ).toMatchObject({ kind: "estimated", total: 5, usedDefault: true });
  });
});
