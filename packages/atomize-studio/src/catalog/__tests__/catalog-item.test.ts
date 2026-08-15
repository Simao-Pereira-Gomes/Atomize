import { describe, expect, it } from "vitest";
import { parseCatalogItems } from "../catalog-item";

const catalogFixture = [
  {
    name: "delivery",
    displayName: "Delivery Template",
    description: "A complete delivery workflow.",
    ref: "template:delivery",
    scope: "project",
    kind: "template",
    path: "/workspace/.atomize/templates/delivery.atomize.yaml",
    content: {
      version: "1.0",
      name: "Delivery Template",
      filter: { workItemTypes: ["User Story"], excludeIfHasTasks: true },
      tasks: [{ id: "build", title: "Build", estimationPercent: 100 }],
    },
  },
  {
    name: "release",
    displayName: "Release Mixin",
    description: "Reusable release tasks.",
    ref: "mixin:release",
    scope: "user",
    kind: "mixin",
    path: "/home/.atomize/mixins/release.atomize.yaml",
    content: { name: "Release Mixin", tasks: [{ title: "Tag release" }] },
  },
];

describe("parseCatalogItems", () => {
  it("parses both Templates and Mixins across scopes", () => {
    expect(parseCatalogItems(catalogFixture)).toEqual([
      { name: "delivery", displayName: "Delivery Template", description: "A complete delivery workflow.", ref: "template:delivery", scope: "project", kind: "template", content: catalogFixture[0]!.content },
      { name: "release", displayName: "Release Mixin", description: "Reusable release tasks.", ref: "mixin:release", scope: "user", kind: "mixin", content: catalogFixture[1]!.content },
    ]);
  });

  it("skips items whose content could not be resolved", () => {
    expect(parseCatalogItems([{ ...catalogFixture[0], content: undefined }])).toEqual([]);
  });

  it("throws when the response is not an array", () => {
    expect(() => parseCatalogItems({})).toThrow("Catalog response must be an array.");
  });

  it("throws when an item's ref does not match its kind", () => {
    expect(() => parseCatalogItems([{ ...catalogFixture[0], ref: "mixin:delivery" }])).toThrow(
      "Catalog response contains an invalid Catalog item.",
    );
  });

  it("throws for an unrecognized scope", () => {
    expect(() => parseCatalogItems([{ ...catalogFixture[0], scope: "team" }])).toThrow(
      "Catalog response contains an invalid Catalog item.",
    );
  });

  it("throws for an unrecognized kind", () => {
    expect(() => parseCatalogItems([{ ...catalogFixture[0], kind: "platform", ref: "platform:delivery" }])).toThrow(
      "Catalog response contains an invalid Catalog item.",
    );
  });
});
