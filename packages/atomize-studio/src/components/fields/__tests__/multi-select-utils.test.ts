import { describe, expect, it } from "vitest";
import { shouldAddCustomValue } from "../multi-select-utils";

describe("shouldAddCustomValue", () => {
  it("leaves a matching search query for the combobox to select", () => {
    expect(shouldAddCustomValue("acti", ["Active", "Closed"])).toBe(false);
  });

  it("allows a value that has no available match", () => {
    expect(shouldAddCustomValue("External state", ["Active", "Closed"])).toBe(true);
  });
});
