import { describe, expect, test } from "bun:test";
import { convertStoryEstimate, resolveStoryEstimate } from "@sppg2001/atomize-core/core/estimation-conversion";

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

describe("convertStoryEstimate with a table", () => {
  const tShirt = { table: { XS: 1, S: 2, M: 4, L: 5, XL: 13 } };

  test("looks up categories exactly", () => {
    expect(convertStoryEstimate("L", tShirt)).toEqual({ kind: "resolved", total: 5 });
    expect(convertStoryEstimate("l", tShirt).kind).toBe("unresolvable");
  });

  test("matches numeric Story Estimates against numeric keys, for scales that aren't linear", () => {
    const fibonacci = { table: { 1: 2, 2: 4, 3: 8, 5: 16 } };
    expect(convertStoryEstimate(5, fibonacci)).toEqual({ kind: "resolved", total: 16 });
    expect(convertStoryEstimate(4, fibonacci).kind).toBe("unresolvable");
  });

  test("a value missing from the table is unresolvable and named in the reason", () => {
    const result = convertStoryEstimate("XXL", tShirt);
    expect(result).toEqual({ kind: "unresolvable", reason: 'Story Estimate "XXL" is not in the conversion table' });
  });

  test("compound values are matched literally, never parsed", () => {
    expect(convertStoryEstimate("0.32L", { table: { "0.32L": 1.6 } })).toEqual({ kind: "resolved", total: 1.6 });
    expect(convertStoryEstimate("0.5L", { table: { "0.32L": 1.6, L: 5 } }).kind).toBe("unresolvable");
  });

  test("use-default converts a category default through the table", () => {
    const result = resolveStoryEstimate(undefined, {
      ifParentHasNoEstimation: "use-default",
      defaultParentEstimation: "M",
      conversion: tShirt,
    });
    expect(result).toEqual({ kind: "resolved", total: 4, fallbackReason: "Story has no estimate" });
  });
});

describe("convertStoryEstimate with multipliers", () => {
  const sizes = { table: { S: 2, M: 4, L: 5, XL: 5, "2XL": 8, "0.32L": 1.6 }, multipliers: true };

  test("multiplies the number in front of a table key", () => {
    expect(convertStoryEstimate("0.3XL", sizes)).toEqual({ kind: "resolved", total: 1.5 });
    expect(convertStoryEstimate("0.3 XL", sizes)).toEqual({ kind: "resolved", total: 1.5 });
    expect(convertStoryEstimate("2L", sizes)).toEqual({ kind: "resolved", total: 10 });
    expect(convertStoryEstimate(".5M", sizes)).toEqual({ kind: "resolved", total: 2 });
  });

  test("an exact key wins over parsing", () => {
    expect(convertStoryEstimate("0.32L", sizes)).toEqual({ kind: "resolved", total: 1.6 });
    expect(convertStoryEstimate("2XL", sizes)).toEqual({ kind: "resolved", total: 8 });
  });

  test("prefers the longest matching key", () => {
    expect(convertStoryEstimate("0.5 2XL", sizes)).toEqual({ kind: "resolved", total: 4 });
  });

  test("an unknown key or malformed value stays unresolvable", () => {
    for (const value of ["0.3XXL", "XL*0.3", "0,3XL", "-1L", "L0.3", "0.3"]) {
      expect(convertStoryEstimate(value, sizes).kind).toBe("unresolvable");
    }
  });

  test("the reason mentions multiples when multipliers are on", () => {
    const result = convertStoryEstimate("0.3XXL", sizes);
    if (result.kind === "unresolvable") expect(result.reason).toContain("not a multiple of a table key");
  });

  test("without multipliers a multiplier value is unresolvable", () => {
    expect(convertStoryEstimate("0.3XL", { table: { XL: 5 } }).kind).toBe("unresolvable");
  });

  test("use-default accepts a multiplier default", () => {
    const result = resolveStoryEstimate(undefined, {
      ifParentHasNoEstimation: "use-default",
      defaultParentEstimation: "0.5L",
      conversion: sizes,
    });
    expect(result).toMatchObject({ kind: "resolved", total: 2.5 });
  });
});

describe("resolveStoryEstimate", () => {
  test("a resolvable Story Estimate is converted regardless of policy", () => {
    expect(resolveStoryEstimate(5, { conversion: { factor: 2 }, ifParentHasNoEstimation: "skip" })).toEqual({
      kind: "resolved",
      total: 10,
    });
  });

  test("warn is the default and leaves Task Estimates blank", () => {
    expect(resolveStoryEstimate(undefined).kind).toBe("blank");
    expect(resolveStoryEstimate(undefined, { ifParentHasNoEstimation: "warn" }).kind).toBe("blank");
  });

  test("skip skips the Story and carries the reason", () => {
    const result = resolveStoryEstimate(undefined, { ifParentHasNoEstimation: "skip" });
    expect(result).toEqual({ kind: "skip", reason: "Story has no estimate" });
  });

  test("use-default converts defaultParentEstimation through the same conversion", () => {
    const result = resolveStoryEstimate(undefined, {
      ifParentHasNoEstimation: "use-default",
      defaultParentEstimation: 3,
      conversion: { factor: 4 },
    });
    expect(result).toEqual({ kind: "resolved", total: 12, fallbackReason: "Story has no estimate" });
  });

  test("use-default with no defaultParentEstimation falls back to blank estimates", () => {
    const result = resolveStoryEstimate(undefined, { ifParentHasNoEstimation: "use-default" });
    expect(result.kind).toBe("blank");
    if (result.kind === "blank") expect(result.reason).toContain("no defaultParentEstimation");
  });

  test("a non-numeric Story Estimate is handled by the policy too", () => {
    expect(resolveStoryEstimate("L", { ifParentHasNoEstimation: "skip" }).kind).toBe("skip");
  });
});
