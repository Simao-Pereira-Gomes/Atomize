import { describe, expect, test } from "bun:test";
import { formatEstimateValue } from "../../src/estimate-format";

describe("formatEstimateValue", () => {
  test("hides floating-point noise from summed estimates", () => {
    expect(formatEstimateValue(1.2 + 1.2 + 1.2 + 1.2 + 1.2)).toBe("6");
    expect(formatEstimateValue(13.000000000000002)).toBe("13");
  });

  test("rounds to two decimals", () => {
    expect(formatEstimateValue(2.3333333)).toBe("2.33");
    expect(formatEstimateValue(2.346)).toBe("2.35");
  });

  test("keeps values with two decimals or fewer as they are, without trailing zeros", () => {
    expect(formatEstimateValue(1.3)).toBe("1.3");
    expect(formatEstimateValue(0.25)).toBe("0.25");
    expect(formatEstimateValue(8)).toBe("8");
    expect(formatEstimateValue(0)).toBe("0");
  });
});
