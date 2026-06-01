import { describe, expect, test } from "bun:test";
import {
  buildTypeLabel,
  filterFieldsForList,
} from "@/cli/commands/fields/fields-list.command";
import type { ADoFieldSchema } from "@/platforms/interfaces/field-schema.interface";

describe("filterFieldsForList", () => {
  const fields: ADoFieldSchema[] = [
    {
      referenceName: "System.Title",
      name: "Title",
      type: "string",
      isCustom: false,
      isReadOnly: false,
      isMultiline: false,
      isPicklist: false,
    },
    {
      referenceName: "Custom.ClientTier",
      name: "Client Tier",
      type: "string",
      isCustom: true,
      isReadOnly: false,
      isMultiline: false,
      isPicklist: false,
    },
  ];

  test("returns all fields when customOnly is false", () => {
    expect(filterFieldsForList(fields, false)).toEqual(fields);
  });

  test("returns only custom fields when customOnly is true", () => {
    expect(filterFieldsForList(fields, true)).toEqual([
      {
        referenceName: "Custom.ClientTier",
        name: "Client Tier",
        type: "string",
        isCustom: true,
        isReadOnly: false,
        isMultiline: false,
        isPicklist: false,
      },
    ]);
  });
});

describe("buildTypeLabel", () => {
  test("labels string picklists distinctly", () => {
    expect(buildTypeLabel({
      referenceName: "Custom.ClientTier",
      name: "Client Tier",
      type: "string",
      isCustom: true,
      isReadOnly: false,
      isMultiline: false,
      isPicklist: true,
      allowedValues: ["Standard", "Premium"],
    })).toBe("picklist-str");
  });

  test("labels integer picklists distinctly", () => {
    expect(buildTypeLabel({
      referenceName: "Custom.TierRank",
      name: "Tier Rank",
      type: "integer",
      isCustom: true,
      isReadOnly: false,
      isMultiline: false,
      isPicklist: true,
      allowedValues: ["1", "2", "3"],
    })).toBe("picklist-int");
  });
});
