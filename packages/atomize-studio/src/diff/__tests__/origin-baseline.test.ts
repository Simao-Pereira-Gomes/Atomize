import { describe, expect, it } from "vitest";
import { stripToAuthoredTemplate } from "../../catalog/authored-template";
import type { CatalogItem } from "../../catalog/catalog-item";
import { toCatalogClone } from "../../starting-paths/catalog-clone";
import {
  catalogTemplateOrigin,
  loadOriginBaseline,
  type OriginBaselineState,
  shouldLoadBaseline,
} from "../origin-baseline";

const catalogTemplate = (over: Partial<Record<string, unknown>> = {}) => ({
  name: "delivery",
  displayName: "Delivery",
  description: "A delivery workflow.",
  ref: "template:delivery",
  scope: "user",
  kind: "template",
  content: {
    version: "1.0",
    name: "Delivery",
    filter: { workItemTypes: ["User Story"], excludeIfHasTasks: true },
    tasks: [{ id: "build", title: "Build", estimationPercent: 100 }],
    extends: "template:base",
    mixins: ["mixin:release"],
    origin: "template:upstream",
  },
  ...over,
});

describe("loadOriginBaseline", () => {
  it("resolves the origin ref to the stripped Catalog content", async () => {
    const result = await loadOriginBaseline("template:delivery", async () => [catalogTemplate()]);
    expect(result).toEqual({
      status: "resolved",
      item: expect.objectContaining({ ref: "template:delivery" }),
      template: {
        version: "1.0",
        name: "Delivery",
        filter: { workItemTypes: ["User Story"], excludeIfHasTasks: true },
        tasks: [{ id: "build", title: "Build", estimationPercent: 100 }],
      },
    });
  });

  it("reports not-in-catalog when no template matches the ref", async () => {
    const result = await loadOriginBaseline("template:gone", async () => [catalogTemplate()]);
    expect(result).toEqual({ status: "not-in-catalog", ref: "template:gone" });
  });

  it("does not match a mixin that happens to share the ref stem", async () => {
    const mixin = catalogTemplate({
      ref: "mixin:delivery",
      kind: "mixin",
      content: { version: "1.0", name: "delivery", tasks: [{ title: "X", estimationPercent: 100 }] },
    });
    const result = await loadOriginBaseline("template:delivery", async () => [mixin]);
    expect(result.status).toBe("not-in-catalog");
  });

  it("propagates a catalog fetch failure rather than swallowing it", async () => {
    await expect(
      loadOriginBaseline("template:delivery", async () => {
        throw new Error("companion process recovering");
      }),
    ).rejects.toThrow("companion process recovering");
  });

  it("uses the same strip transform as Catalog Clone (clone === baseline + origin)", async () => {
    const item = catalogTemplate() as unknown as Extract<CatalogItem, { kind: "template" }>;
    const baseline = stripToAuthoredTemplate(item.content);
    expect(toCatalogClone(item)).toEqual({ ...baseline, origin: item.ref });
  });
});

describe("catalogTemplateOrigin", () => {
  it("keeps a template: ref", () => {
    expect(catalogTemplateOrigin("template:delivery")).toBe("template:delivery");
  });

  it("rejects a mixin: ref, empty, and non-string origins (diff segment stays hidden)", () => {
    expect(catalogTemplateOrigin("mixin:release")).toBeUndefined();
    expect(catalogTemplateOrigin("")).toBeUndefined();
    expect(catalogTemplateOrigin(undefined)).toBeUndefined();
  });
});

describe("shouldLoadBaseline", () => {
  it("loads from idle and error states", () => {
    expect(shouldLoadBaseline({ phase: "idle" }, "template:d")).toBe(true);
    expect(shouldLoadBaseline({ phase: "error", message: "x" }, "template:d")).toBe(true);
  });

  it("does not re-load while a fetch is in flight", () => {
    expect(shouldLoadBaseline({ phase: "loading" }, "template:d")).toBe(false);
  });

  it("does not re-load a settled result for the same ref, but does for a different ref", () => {
    const resolved: OriginBaselineState = {
      phase: "resolved",
      ref: "template:d",
      baseline: { version: "1.0", name: "D", filter: {}, tasks: [{ title: "T" }] } as never,
    };
    expect(shouldLoadBaseline(resolved, "template:d")).toBe(false);
    expect(shouldLoadBaseline(resolved, "template:other")).toBe(true);
    expect(shouldLoadBaseline({ phase: "not-in-catalog", ref: "template:d" }, "template:d")).toBe(false);
    expect(shouldLoadBaseline({ phase: "not-in-catalog", ref: "template:d" }, "template:other")).toBe(true);
  });
});
