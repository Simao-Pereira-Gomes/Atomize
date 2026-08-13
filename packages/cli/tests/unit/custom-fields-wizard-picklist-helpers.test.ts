import { describe, expect, test } from "bun:test";
import type { ADoFieldSchema } from "@sppg2001/atomize-core/platforms/interfaces/field-schema.interface";
import {
  buildPicklistOptions,
  coercePicklistValue,
} from "@/cli/commands/template/custom-fields-wizard";

describe("buildPicklistOptions", () => {
  test("maps allowed values into select options", () => {
    const field: ADoFieldSchema = {
      referenceName: "Custom.ClientTier",
      name: "Client Tier",
      type: "string",
      isCustom: true,
      isReadOnly: false,
      isMultiline: false,
      isPicklist: true,
      allowedValues: ["Standard", "Premium", "Enterprise"],
    };

    expect(buildPicklistOptions(field)).toEqual([
      { label: "Standard", value: "Standard" },
      { label: "Premium", value: "Premium" },
      { label: "Enterprise", value: "Enterprise" },
    ]);
  });
});

describe("coercePicklistValue", () => {
  test("keeps string picklist values as strings", () => {
    expect(coercePicklistValue({ type: "string" }, "Enterprise")).toBe("Enterprise");
  });

  test("coerces integer picklist values to numbers", () => {
    expect(coercePicklistValue({ type: "integer" }, "2")).toBe(2);
  });
});
