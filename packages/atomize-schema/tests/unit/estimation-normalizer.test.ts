import { describe, expect, test } from "bun:test";
import { normalizeEstimationPercentages } from "../../src/estimation-normalizer.js";

interface Item {
  name: string;
  estimationPercent?: number;
}

const sum = (items: Item[]): number =>
  items.reduce((acc, item) => acc + (item.estimationPercent ?? 0), 0);

const percents = (items: Item[]): number[] =>
  items.map((item) => item.estimationPercent ?? 0);

describe("normalizeEstimationPercentages", () => {
  test("returns false and mutates nothing for an empty list", () => {
    const items: Item[] = [];
    expect(normalizeEstimationPercentages(items)).toBe(false);
    expect(items).toEqual([]);
  });

  test("forces a single task to the full target regardless of its current value", () => {
    const items: Item[] = [{ name: "only", estimationPercent: 12 }];
    expect(normalizeEstimationPercentages(items)).toBe(true);
    expect(items[0]?.estimationPercent).toBe(100);
  });

  test("forces a single task to a custom target total", () => {
    const items: Item[] = [{ name: "only" }];
    expect(normalizeEstimationPercentages(items, { targetTotal: 8 })).toBe(true);
    expect(items[0]?.estimationPercent).toBe(8);
  });

  test("skips a set that already sums to the target within tolerance", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: 40 },
      { name: "b", estimationPercent: 60 },
    ];
    expect(normalizeEstimationPercentages(items)).toBe(false);
    expect(percents(items)).toEqual([40, 60]);
  });

  test("skips (and leaves untouched) a set that overshoots the target", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: 60 },
      { name: "b", estimationPercent: 60 },
    ];
    expect(normalizeEstimationPercentages(items)).toBe(false);
    expect(percents(items)).toEqual([60, 60]);
  });

  test("scales an under-target set up to exactly the target", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: 20 },
      { name: "b", estimationPercent: 30 },
    ];
    expect(normalizeEstimationPercentages(items)).toBe(true);
    expect(percents(items)).toEqual([40, 60]);
    expect(sum(items)).toBe(100);
  });

  test("scales an over-target set down to exactly the target when skipIfAlreadyNormalized is false", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: 90 },
      { name: "b", estimationPercent: 90 },
      { name: "c", estimationPercent: 120 },
    ];
    expect(
      normalizeEstimationPercentages(items, { skipIfAlreadyNormalized: false }),
    ).toBe(true);
    expect(sum(items)).toBe(100);
  });

  test("re-normalizes an already-100 set when skipIfAlreadyNormalized is false", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: 40 },
      { name: "b", estimationPercent: 60 },
    ];
    expect(
      normalizeEstimationPercentages(items, { skipIfAlreadyNormalized: false }),
    ).toBe(true);
    expect(sum(items)).toBe(100);
  });

  test("distributes evenly when every task is zero, giving the remainder to the first", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: 0 },
      { name: "b" },
      { name: "c", estimationPercent: 0 },
    ];
    expect(normalizeEstimationPercentages(items)).toBe(true);
    expect(percents(items)).toEqual([34, 33, 33]);
    expect(sum(items)).toBe(100);
  });

  test("does not propagate NaN from tasks with a NaN percentage", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: Number.NaN },
      { name: "b", estimationPercent: Number.NaN },
    ];
    expect(normalizeEstimationPercentages(items)).toBe(true);
    expect(percents(items)).toEqual([50, 50]);
  });

  test("absorbs rounding drift into the last task so the sum is exact", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: 1 },
      { name: "b", estimationPercent: 1 },
      { name: "c", estimationPercent: 1 },
    ];
    expect(normalizeEstimationPercentages(items)).toBe(true);
    expect(sum(items)).toBe(100);
    expect(items[2]?.estimationPercent).toBe(100 - 33 - 33);
  });

  test("preserves the relative ordering of task sizes after scaling", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: 10 },
      { name: "b", estimationPercent: 20 },
      { name: "c", estimationPercent: 30 },
    ];
    normalizeEstimationPercentages(items);
    const scaled = percents(items);
    expect(scaled[0] as number).toBeLessThan(scaled[1] as number);
    expect(scaled[1] as number).toBeLessThan(scaled[2] as number);
    expect(sum(items)).toBe(100);
  });

  test("normalizes to a custom target total", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: 1 },
      { name: "b", estimationPercent: 1 },
    ];
    expect(normalizeEstimationPercentages(items, { targetTotal: 1000 })).toBe(
      true,
    );
    expect(sum(items)).toBe(1000);
  });

  test("honours a widened tolerance to leave a near-target set alone", () => {
    const items: Item[] = [
      { name: "a", estimationPercent: 49.9 },
      { name: "b", estimationPercent: 50 },
    ];
    expect(normalizeEstimationPercentages(items, { tolerance: 0.5 })).toBe(false);
    expect(normalizeEstimationPercentages(items, { tolerance: 0.01 })).toBe(true);
    expect(sum(items)).toBe(100);
  });
});
