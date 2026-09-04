import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../../catalog/catalog-item";
import { toCatalogClone } from "../catalog-clone";

const catalogItem: Extract<CatalogItem, { kind: "template" }> = {
  name: "delivery",
  displayName: "Delivery Template",
  description: "A complete delivery workflow.",
  ref: "template:delivery",
  scope: "project",
  kind: "template",
  content: {
    version: "1.0",
    name: "Delivery Template",
    filter: { workItemTypes: ["User Story"], excludeIfHasTasks: true },
    tasks: [{ id: "build", title: "Build", estimationPercent: 100 }],
    extends: "template:base",
    mixins: ["mixin:release"],
    origin: "template:upstream",
  },
};

describe("Catalog clone transform", () => {
  it("flattens the selected resolved Template and records the clone's origin", () => {
    expect(toCatalogClone(catalogItem)).toEqual({
      version: "1.0",
      name: "Delivery Template",
      filter: { workItemTypes: ["User Story"], excludeIfHasTasks: true },
      tasks: [{ id: "build", title: "Build", estimationPercent: 100 }],
      origin: "template:delivery",
    });
  });
});
