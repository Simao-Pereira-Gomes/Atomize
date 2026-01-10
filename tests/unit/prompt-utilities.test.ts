import { describe, expect, test } from "bun:test";
import { Filters, Validators } from "@/cli//utilities/prompt-utilities";

describe("Validators", () => {
  describe("required", () => {
    test("should return error for empty string", () => {
      const validator = Validators.required("Field");
      expect(validator("")).toBe("Field is required");
    });

    test("should return error for whitespace only", () => {
      const validator = Validators.required("Field");
      expect(validator("   ")).toBe("Field is required");
    });

    test("should return true for valid input", () => {
      const validator = Validators.required("Field");
      expect(validator("value")).toBe(true);
    });
  });

  describe("maxLength", () => {
    test("should return error when exceeding max length", () => {
      const validator = Validators.maxLength("Field", 5);
      expect(validator("123456")).toBe("Field must be 5 characters or less");
    });

    test("should return true when within max length", () => {
      const validator = Validators.maxLength("Field", 5);
      expect(validator("123")).toBe(true);
    });

    test("should return true when exactly at max length", () => {
      const validator = Validators.maxLength("Field", 5);
      expect(validator("12345")).toBe(true);
    });
  });

  describe("requiredWithMaxLength", () => {
    test("should validate both required and max length", () => {
      const validator = Validators.requiredWithMaxLength("Field", 5);

      expect(validator("")).toBe("Field is required");
      expect(validator("123456")).toBe("Field must be 5 characters or less");
      expect(validator("123")).toBe(true);
    });
  });

  describe("estimationPercent", () => {
    test("should reject non-numeric input", () => {
      expect(Validators.estimationPercent("abc")).toBe(
        "Estimation must be a valid number"
      );
    });

    test("should reject negative values", () => {
      expect(Validators.estimationPercent("-10")).toBe(
        "Estimation cannot be negative"
      );
    });

    test("should reject values over 100", () => {
      expect(Validators.estimationPercent("150")).toBe(
        "Estimation cannot exceed 100%"
      );
    });

    test("should accept valid percentages", () => {
      expect(Validators.estimationPercent("0")).toBe(true);
      expect(Validators.estimationPercent("50")).toBe(true);
      expect(Validators.estimationPercent("100")).toBe(true);
      expect(Validators.estimationPercent("33.5")).toBe(true);
    });
  });

  describe("email", () => {
    test("should reject invalid email", () => {
      expect(Validators.email("notanemail")).toBe(
        "Please enter a valid email address"
      );
    });

    test("should accept valid email", () => {
      expect(Validators.email("user@example.com")).toBe(true);
    });
  });

  describe("priorityRange", () => {
    test("should accept optional values (NaN)", () => {
      expect(Validators.priorityRange(Number.NaN)).toBe(true);
    });

    test("should reject values outside range", () => {
      expect(Validators.priorityRange(0)).toBe(
        "Priority must be between 1 and 4"
      );
      expect(Validators.priorityRange(5)).toBe(
        "Priority must be between 1 and 4"
      );
    });

    test("should accept values in range", () => {
      expect(Validators.priorityRange(1)).toBe(true);
      expect(Validators.priorityRange(2)).toBe(true);
      expect(Validators.priorityRange(3)).toBe(true);
      expect(Validators.priorityRange(4)).toBe(true);
    });
  });

  describe("nonNegative", () => {
    test("should accept optional values (NaN)", () => {
      const validator = Validators.nonNegative("Field");
      expect(validator(Number.NaN)).toBe(true);
    });

    test("should reject negative values", () => {
      const validator = Validators.nonNegative("Field");
      expect(validator(-1)).toBe("Field cannot be negative");
    });

    test("should accept non-negative values", () => {
      const validator = Validators.nonNegative("Field");
      expect(validator(0)).toBe(true);
      expect(validator(10)).toBe(true);
    });
  });
});

describe("Filters", () => {
  describe("commaSeparated", () => {
    test("should return empty array for empty string", () => {
      expect(Filters.commaSeparated("")).toEqual([]);
    });

    test("should split and trim comma-separated values", () => {
      expect(Filters.commaSeparated("a, b, c")).toEqual(["a", "b", "c"]);
    });

    test("should handle single value", () => {
      expect(Filters.commaSeparated("single")).toEqual(["single"]);
    });

    test("should trim whitespace", () => {
      expect(Filters.commaSeparated("  a  ,  b  ,  c  ")).toEqual([
        "a",
        "b",
        "c",
      ]);
    });
  });

  describe("toNumber", () => {
    test("should convert string to number", () => {
      expect(Filters.toNumber("42")).toBe(42);
      expect(Filters.toNumber("3.14")).toBe(3.14);
    });

    test("should return NaN for invalid input", () => {
      expect(Number.isNaN(Filters.toNumber("abc"))).toBe(true);
    });
  });
});
