import { describe, expect, test } from "bun:test";
import { convertStoryEstimate } from "@sppg2001/atomize-core/core/estimation-conversion";

describe("convertStoryEstimate", () => {
  test("uses a numeric Story Estimate one-to-one when there is no conversion", () => {
    expect(convertStoryEstimate(5)).toEqual({ kind: "resolved", total: 5 });
  });

  test("accepts numeric strings", () => {
    expect(convertStoryEstimate("8")).toEqual({ kind: "resolved", total: 8 });
  });

  test("multiplies by the factor", () => {
    expect(convertStoryEstimate(5, { factor: 4 })).toEqual({ kind: "resolved", total: 20 });
  });

  test("supports fractional factors without floating-point noise", () => {
    expect(convertStoryEstimate(5, { factor: 0.1 })).toEqual({ kind: "resolved", total: 0.5 });
  });

  test("a zero Story Estimate converts to zero", () => {
    expect(convertStoryEstimate(0, { factor: 4 })).toEqual({ kind: "resolved", total: 0 });
  });

  test("a missing Story Estimate is unresolvable", () => {
    const result = convertStoryEstimate(undefined, { factor: 4 });
    expect(result.kind).toBe("unresolvable");
  });

  test("a non-numeric Story Estimate is unresolvable without a conversion that covers it", () => {
    const withoutConversion = convertStoryEstimate("L");
    const withFactor = convertStoryEstimate("L", { factor: 4 });
    expect(withoutConversion.kind).toBe("unresolvable");
    expect(withFactor.kind).toBe("unresolvable");
    if (withoutConversion.kind === "unresolvable") expect(withoutConversion.reason).toContain('"L"');
  });
});
