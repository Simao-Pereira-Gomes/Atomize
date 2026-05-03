import { describe, expect, test } from "bun:test";
import { shouldOfferStoryValueInterpolation } from "@/cli/commands/template/custom-fields-wizard";
import type { ADoFieldSchema } from "@/platforms/interfaces/field-schema.interface";

describe("shouldOfferStoryValueInterpolation", () => {
  function makeSchema(referenceName: string): ADoFieldSchema {
    return {
      referenceName,
      name: referenceName,
      type: "string",
      isCustom: true,
      isReadOnly: false,
      isMultiline: false,
      isPicklist: false,
    };
  }

  test("returns true when the same field exists on the parent story", () => {
    expect(
      shouldOfferStoryValueInterpolation("Custom.ClientTier", [
        makeSchema("Custom.ClientTier"),
      ]),
    ).toBe(true);
  });

  test("returns true for picklist fields too because interpolation is schema-based", () => {
    expect(
      shouldOfferStoryValueInterpolation("Custom.TierRank", [
        {
          ...makeSchema("Custom.TierRank"),
          type: "integer",
          isPicklist: true,
          allowedValues: ["1", "2", "3"],
        },
      ]),
    ).toBe(true);
  });

  test("returns false when the parent story does not expose the field", () => {
    expect(
      shouldOfferStoryValueInterpolation("Custom.ClientTier", [
        makeSchema("Custom.ReleaseVersion"),
      ]),
    ).toBe(false);
  });
});
