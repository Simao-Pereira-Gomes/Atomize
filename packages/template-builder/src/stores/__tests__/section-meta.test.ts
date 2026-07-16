import { describe, expect, it } from "vitest";
import { SECTION_META } from "../sections";

describe("SECTION_META", () => {
  it("lists the seven builder sections in authoring order", () => {
    expect(SECTION_META.map((section) => section.id)).toEqual([
      "basic-info",
      "filter",
      "tasks",
      "estimation",
      "validation",
      "metadata",
      "review",
    ]);
  });
});
