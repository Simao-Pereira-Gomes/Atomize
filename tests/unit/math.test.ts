import { describe, expect, test } from "bun:test";
import { clampConcurrency } from "@utils/math";

describe("clampConcurrency", () => {
  test("returns the value unchanged when it is within range", () => {
    expect(clampConcurrency(5, 1, 10, 3)).toBe(5);
  });

  test("returns the default when value is below the minimum", () => {
    expect(clampConcurrency(0, 1, 10, 3)).toBe(3);
  });

  test("returns the default when value is above the maximum", () => {
    expect(clampConcurrency(11, 1, 10, 3)).toBe(3);
  });

  test("accepts the minimum boundary value as valid", () => {
    expect(clampConcurrency(1, 1, 10, 3)).toBe(1);
  });

  test("accepts the maximum boundary value as valid", () => {
    expect(clampConcurrency(10, 1, 10, 3)).toBe(10);
  });

  test("uses the supplied default, not a hardcoded fallback", () => {
    expect(clampConcurrency(0, 1, 5, 99)).toBe(99);
  });

  test("works correctly for the task-concurrency range (1–20, default 5)", () => {
    expect(clampConcurrency(20, 1, 20, 5)).toBe(20);
    expect(clampConcurrency(21, 1, 20, 5)).toBe(5);
    expect(clampConcurrency(1, 1, 20, 5)).toBe(1);
  });

  test("works correctly for the story-concurrency range (1–10, default 3)", () => {
    expect(clampConcurrency(10, 1, 10, 3)).toBe(10);
    expect(clampConcurrency(11, 1, 10, 3)).toBe(3);
    expect(clampConcurrency(0, 1, 10, 3)).toBe(3);
  });
});
