import { describe, expect, it } from "vitest";
import { createAuthoringStore } from "../../stores/sections";
import { sectionStatus, usesDefaultSectionSettings } from "../section-status";

describe("sectionStatus", () => {
  it("marks optional Estimation and Validation ready at their valid defaults", () => {
    const store = createAuthoringStore();

    expect(sectionStatus(store, "estimation")).toBe("ok");
    expect(sectionStatus(store, "validation")).toBe("ok");
    expect(usesDefaultSectionSettings(store, "estimation")).toBe(true);
    expect(usesDefaultSectionSettings(store, "validation")).toBe(true);
  });
});
