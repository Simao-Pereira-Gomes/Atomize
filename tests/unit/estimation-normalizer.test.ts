import { describe, expect, test } from "bun:test";
import {
  normalizeEstimationPercentages,
  validateEstimationPercentages,
} from "@utils/estimation-normalizer";

interface TestItem {
  name: string;
  estimationPercent?: number;
}

describe("normalizeEstimationPercentages", () => {
  test("should handle empty array", () => {
    const items: TestItem[] = [];
    const result = normalizeEstimationPercentages(items);
    expect(result).toBe(false);
    expect(items).toEqual([]);
  });

  test("should set single item to 100%", () => {
    const items: TestItem[] = [{ name: "Item 1", estimationPercent: 50 }];

    const result = normalizeEstimationPercentages(items);
    expect(result).toBe(true);
    expect(items[0]?.estimationPercent).toBe(100);
  });

  test("should skip normalization when total is already 100", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 40 },
      { name: "Item 2", estimationPercent: 60 },
    ];

    const result = normalizeEstimationPercentages(items, {
      skipIfAlreadyNormalized: true,
    });

    expect(result).toBe(false);
    expect(items[0]?.estimationPercent).toBe(40);
    expect(items[1]?.estimationPercent).toBe(60);
  });

  test("should skip normalization when total is > 100", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 50 },
      { name: "Item 2", estimationPercent: 60 },
    ];

    const result = normalizeEstimationPercentages(items, {
      skipIfAlreadyNormalized: true,
      enableLogging: false,
    });

    expect(result).toBe(false);
    // Values should remain unchanged
    expect(items[0]?.estimationPercent).toBe(50);
    expect(items[1]?.estimationPercent).toBe(60);
  });

  test("should normalize when total is < 100", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 20 },
      { name: "Item 2", estimationPercent: 30 },
    ];

    const result = normalizeEstimationPercentages(items, {
      enableLogging: false,
    });

    expect(result).toBe(true);
    const total = items.reduce((sum, i) => sum + (i.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should normalize when skipIfAlreadyNormalized is false", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 40 },
      { name: "Item 2", estimationPercent: 60 },
    ];

    const result = normalizeEstimationPercentages(items, {
      skipIfAlreadyNormalized: false,
      enableLogging: false,
    });

    expect(result).toBe(true);
    // Should still sum to 100
    const total = items.reduce((sum, i) => sum + (i.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should distribute equally when total is zero", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 0 },
      { name: "Item 2", estimationPercent: 0 },
      { name: "Item 3", estimationPercent: 0 },
    ];

    const result = normalizeEstimationPercentages(items, {
      enableLogging: false,
    });

    expect(result).toBe(true);
    const total = items.reduce((sum, i) => sum + (i.estimationPercent || 0), 0);
    expect(total).toBe(100);

    // Should distribute as evenly as possible: 34, 33, 33
    expect(items[0]?.estimationPercent).toBe(34);
    expect(items[1]?.estimationPercent).toBe(33);
    expect(items[2]?.estimationPercent).toBe(33);
  });

  test("should scale proportionally to 100%", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 20 },
      { name: "Item 2", estimationPercent: 30 },
      { name: "Item 3", estimationPercent: 10 },
    ];

    const result = normalizeEstimationPercentages(items, {
      enableLogging: false,
    });

    expect(result).toBe(true);
    const total = items.reduce((sum, i) => sum + (i.estimationPercent || 0), 0);
    expect(total).toBe(100);

    // Original ratio was 20:30:10 (60 total)
    // Scaled should be approximately 33:50:17
    expect(items[0]?.estimationPercent).toBeGreaterThanOrEqual(33);
    expect(items[0]?.estimationPercent).toBeLessThanOrEqual(34);
    expect(items[1]?.estimationPercent).toBeGreaterThanOrEqual(49);
    expect(items[1]?.estimationPercent).toBeLessThanOrEqual(50);
  });

  test("should respect custom tolerance", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 49.9 },
      { name: "Item 2", estimationPercent: 50.0 },
    ];

    // With tolerance 0.5, 99.9 should not trigger normalization
    const result1 = normalizeEstimationPercentages(items, {
      skipIfAlreadyNormalized: true,
      tolerance: 0.5,
      enableLogging: false,
    });

    expect(result1).toBe(false);

    // With tolerance 0.01, 99.9 should trigger normalization
    const result2 = normalizeEstimationPercentages(items, {
      skipIfAlreadyNormalized: true,
      tolerance: 0.01,
      enableLogging: false,
    });

    expect(result2).toBe(true);
  });

  test("should handle items without estimationPercent property", () => {
    const items: TestItem[] = [
      { name: "Item 1" }, // undefined
      { name: "Item 2", estimationPercent: 50 },
    ];

    const result = normalizeEstimationPercentages(items, {
      enableLogging: false,
    });

    expect(result).toBe(true);
    const total = items.reduce((sum, i) => sum + (i.estimationPercent || 0), 0);
    expect(total).toBe(100);
  });

  test("should preserve relative proportions", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 10 },
      { name: "Item 2", estimationPercent: 20 },
      { name: "Item 3", estimationPercent: 30 },
    ];

    normalizeEstimationPercentages(items, { enableLogging: false });

    // Should maintain 1:2:3 ratio
    const ratios = items.map((i) => i.estimationPercent ?? 0);
    expect(ratios).toHaveLength(3);
    //biome-ignore-start lint/style: we already checked for undefined above
    expect(ratios[0]).toBeLessThan(ratios[1]!);
    expect(ratios[1]).toBeLessThan(ratios[2]!);
    //biome-ignore-end lint/style: we already checked for undefined above
  });
});

describe("validateEstimationPercentages", () => {
  test("should validate when total is 100", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 40 },
      { name: "Item 2", estimationPercent: 60 },
    ];

    const result = validateEstimationPercentages(items);

    expect(result.valid).toBe(true);
    expect(result.total).toBe(100);
    expect(result.warnings).toHaveLength(0);
  });

  test("should warn when total differs from 100", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 40 },
      { name: "Item 2", estimationPercent: 50 },
    ];

    const result = validateEstimationPercentages(items);

    expect(result.valid).toBe(false);
    expect(result.total).toBe(90);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("differs from 100%");
  });

  test("should warn about zero estimations", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 100 },
      { name: "Item 2", estimationPercent: 0 },
    ];

    const result = validateEstimationPercentages(items);

    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("zero estimation"))).toBe(
      true
    );
  });

  test("should allow small differences within tolerance", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 50.2 },
      { name: "Item 2", estimationPercent: 49.9 },
    ];

    const result = validateEstimationPercentages(items, 0.5);

    // 100.1 vs 100 = 0.1 difference, within 0.5 tolerance
    expect(result.valid).toBe(true);
  });

  test("should report multiple warnings", () => {
    const items: TestItem[] = [
      { name: "Item 1", estimationPercent: 50 },
      { name: "Item 2", estimationPercent: 0 },
    ];

    const result = validateEstimationPercentages(items);

    expect(result.valid).toBe(false);
    // Should have warnings for both total != 100 and zero estimation
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });
});
