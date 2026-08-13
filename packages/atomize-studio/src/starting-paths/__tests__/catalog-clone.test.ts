import { describe, expect, it } from "vitest";
import { parseCatalogTemplates, toCatalogClone } from "../catalog-clone";

const catalogFixture = [
  {
    name: "delivery",
    displayName: "Delivery Template",
    description: "A complete delivery workflow.",
    ref: "template:delivery",
    scope: "project",
    kind: "template",
    path: "/workspace/.atomize/templates/delivery.atomize.yaml",
    template: {
      version: "1.0",
      name: "Delivery Template",
      filter: { workItemTypes: ["User Story"], excludeIfHasTasks: true },
      tasks: [{ id: "build", title: "Build", estimationPercent: 100 }],
      extends: "template:base",
      mixins: ["mixin:release"],
      origin: "template:upstream",
    },
  },
  {
    name: "release",
    displayName: "Release Mixin",
    description: "Not cloneable by Atomize Studio.",
    ref: "mixin:release",
    scope: "project",
    kind: "mixin",
    path: "/workspace/.atomize/mixins/release.atomize.yaml",
  },
];

describe("Catalog clone transform", () => {
  it("filters CLI output to Templates and flattens the selected resolved Template", () => {
    const [item] = parseCatalogTemplates(catalogFixture);
    if (item === undefined) throw new Error("Expected a Catalog Template fixture.");

    expect(toCatalogClone(item)).toEqual({
      version: "1.0",
      name: "Delivery Template",
      filter: { workItemTypes: ["User Story"], excludeIfHasTasks: true },
      tasks: [{ id: "build", title: "Build", estimationPercent: 100 }],
      origin: "template:delivery",
    });
  });

  it("skips Templates whose CLI response could not resolve a payload", () => {
    expect(parseCatalogTemplates([{ ...catalogFixture[0], template: undefined }])).toEqual([]);
  });
});
