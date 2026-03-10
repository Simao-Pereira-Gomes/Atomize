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

    test("should return undefined for valid input", () => {
      const validator = Validators.required("Field");
      expect(validator("value")).toBeUndefined();
    });
  });

  describe("maxLength", () => {
    test("should return error when exceeding max length", () => {
      const validator = Validators.maxLength("Field", 5);
      expect(validator("123456")).toBe("Field must be 5 characters or less");
    });

    test("should return undefined when within max length", () => {
      const validator = Validators.maxLength("Field", 5);
      expect(validator("123")).toBeUndefined();
    });

    test("should return undefined when exactly at max length", () => {
      const validator = Validators.maxLength("Field", 5);
      expect(validator("12345")).toBeUndefined();
    });
  });

  describe("requiredWithMaxLength", () => {
    test("should validate both required and max length", () => {
      const validator = Validators.requiredWithMaxLength("Field", 5);

      expect(validator("")).toBe("Field is required");
      expect(validator("123456")).toBe("Field must be 5 characters or less");
      expect(validator("123")).toBeUndefined();
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

    test("should return undefined for valid percentages", () => {
      expect(Validators.estimationPercent("0")).toBeUndefined();
      expect(Validators.estimationPercent("50")).toBeUndefined();
      expect(Validators.estimationPercent("100")).toBeUndefined();
      expect(Validators.estimationPercent("33.5")).toBeUndefined();
    });
  });

  describe("email", () => {
    test("should reject invalid email", () => {
      expect(Validators.email("notanemail")).toBe(
        "Please enter a valid email address"
      );
    });

    test("should return undefined for valid email", () => {
      expect(Validators.email("user@example.com")).toBeUndefined();
    });
  });

  describe("priorityRange", () => {
    test("should accept optional values (empty string)", () => {
      expect(Validators.priorityRange("")).toBeUndefined();
    });

    test("should reject values outside range", () => {
      expect(Validators.priorityRange("0")).toBe(
        "Priority must be between 1 and 4"
      );
      expect(Validators.priorityRange("5")).toBe(
        "Priority must be between 1 and 4"
      );
    });

    test("should return undefined for values in range", () => {
      expect(Validators.priorityRange("1")).toBeUndefined();
      expect(Validators.priorityRange("2")).toBeUndefined();
      expect(Validators.priorityRange("3")).toBeUndefined();
      expect(Validators.priorityRange("4")).toBeUndefined();
    });
  });

  describe("nonNegative", () => {
    test("should accept optional values (empty string)", () => {
      const validator = Validators.nonNegative("Field");
      expect(validator("")).toBeUndefined();
    });

    test("should reject negative values", () => {
      const validator = Validators.nonNegative("Field");
      expect(validator("-1")).toBe("Field cannot be negative");
    });

    test("should return undefined for non-negative values", () => {
      const validator = Validators.nonNegative("Field");
      expect(validator("0")).toBeUndefined();
      expect(validator("10")).toBeUndefined();
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
