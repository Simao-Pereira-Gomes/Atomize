import type { Condition } from "@sppg2001/atomize-schema";
import { describe, expect, it } from "vitest";
import type { GroundedTaskField } from "../../../grounding/grounding-service";
import { operatorsForCondition } from "../condition-operators";

const clause = (field: string): Extract<Condition, { field: string }> => ({
  field,
  operator: "equals",
  value: "",
});

describe("operatorsForCondition — hardcoded story fields", () => {
  it("restricts tags to contains/not-contains", () => {
    expect(operatorsForCondition(clause("tags"))).toEqual(["contains", "not-contains"]);
  });

  it("offers numeric comparisons for estimation", () => {
    expect(operatorsForCondition(clause("estimation"))).toEqual([
      "equals",
      "not-equals",
      "gt",
      "lt",
      "gte",
      "lte",
    ]);
  });

  it("offers numeric comparisons for priority", () => {
    expect(operatorsForCondition(clause("priority"))).toEqual([
      "equals",
      "not-equals",
      "gt",
      "lt",
      "gte",
      "lte",
    ]);
  });

  it("restricts state to equals/not-equals, since it's a fixed value set", () => {
    expect(operatorsForCondition(clause("state"))).toEqual(["equals", "not-equals"]);
  });

  it("restricts work item type to equals/not-equals, since it's a fixed value set", () => {
    expect(operatorsForCondition(clause("type"))).toEqual(["equals", "not-equals"]);
  });

  it("allows contains for identity fields like assignedTo", () => {
    expect(operatorsForCondition(clause("assignedTo"))).toEqual([
      "equals",
      "not-equals",
      "contains",
      "not-contains",
    ]);
  });

  it("defaults free-text fields (title, description, areaPath, iteration) to equals/contains", () => {
    for (const field of ["title", "description", "areaPath", "iteration"]) {
      expect(operatorsForCondition(clause(field))).toEqual([
        "equals",
        "not-equals",
        "contains",
        "not-contains",
      ]);
    }
  });
});

describe("operatorsForCondition — grounded custom fields", () => {
  const pickField = (overrides: Partial<GroundedTaskField>): GroundedTaskField => ({
    referenceName: "Custom.Field",
    name: "Field",
    type: "string",
    isCustom: true,
    isReadOnly: false,
    isMultiline: false,
    isPicklist: false,
    ...overrides,
  });

  it("restricts a picklist custom field to equals/not-equals", () => {
    const fields = [pickField({ isPicklist: true })];
    expect(
      operatorsForCondition({ customField: "Custom.Field", operator: "equals", value: "" }, fields),
    ).toEqual(["equals", "not-equals"]);
  });

  it("offers numeric comparisons for an integer custom field", () => {
    const fields = [pickField({ type: "integer" })];
    expect(
      operatorsForCondition({ customField: "Custom.Field", operator: "equals", value: "" }, fields),
    ).toEqual(["equals", "not-equals", "gt", "lt", "gte", "lte"]);
  });

  it("falls back to the free-text default for an unrecognised manual custom field", () => {
    expect(
      operatorsForCondition({ customField: "Custom.Unknown", operator: "equals", value: "" }, []),
    ).toEqual(["equals", "not-equals", "contains", "not-contains"]);
  });
});
