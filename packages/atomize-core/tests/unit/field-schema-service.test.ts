import { describe, expect, test } from "bun:test";
import { FieldSchemaService } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/azure-devops-field-schema.service";
import { FieldType } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import type { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";

const fields = [
  { referenceName: "Custom.StrictSize", name: "Strict size", type: FieldType.String, isPicklist: true, isPicklistSuggested: false },
  { referenceName: "Custom.SuggestedSize", name: "Suggested size", type: FieldType.String, isPicklist: true, isPicklistSuggested: true },
  { referenceName: "Custom.FreeText", name: "Free text", type: FieldType.String, isPicklist: false },
  { referenceName: "Custom.Points", name: "Points", type: FieldType.Double, isPicklist: false },
];

const witApi = {
  getFields: async () => fields,
  getWorkItemTypeFieldsWithReferences: async () =>
    fields.map((f) => ({ referenceName: f.referenceName, name: f.name, allowedValues: f.isPicklist ? ["S", "M"] : [] })),
} as unknown as IWorkItemTrackingApi;

describe("FieldSchemaService allowsCustomValues", () => {
  test.each([
    ["getFieldsForType", (s: FieldSchemaService) => s.getFieldsForType(witApi, "P", "User Story", "k")],
    ["getAllFields", (s: FieldSchemaService) => s.getAllFields(witApi, "P", "k")],
  ] as const)("%s marks suggested picklists and free text as open-ended", async (_name, load) => {
    const byRef = new Map((await load(new FieldSchemaService())).map((f) => [f.referenceName, f.allowsCustomValues]));
    expect(byRef.get("Custom.StrictSize")).toBe(false);
    expect(byRef.get("Custom.SuggestedSize")).toBe(true);
    expect(byRef.get("Custom.FreeText")).toBe(true);
    expect(byRef.get("Custom.Points")).toBe(false);
  });
});

describe("FieldSchemaService requests", () => {
  function countingApi() {
    const calls = { getFields: 0, typeFields: 0 };
    const api = {
      getFields: async () => {
        calls.getFields++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return fields;
      },
      getWorkItemTypeFieldsWithReferences: async () => {
        calls.typeFields++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return fields.map((f) => ({ referenceName: f.referenceName, name: f.name, allowedValues: [] }));
      },
    } as unknown as IWorkItemTrackingApi;
    return { api, calls };
  }

  test("fetches the project's field list once for every Work Item type", async () => {
    const { api, calls } = countingApi();
    const service = new FieldSchemaService();

    await Promise.all(["User Story", "Bug", "Task", "Feature"].map((type) => service.getFieldsForType(api, "P", type, "k")));
    await service.getAllFields(api, "P", "k");

    expect(calls.getFields).toBe(1);
    expect(calls.typeFields).toBe(4);
  });

  test("concurrent requests for the same type share one fetch", async () => {
    const { api, calls } = countingApi();
    const service = new FieldSchemaService();

    await Promise.all([1, 2, 3].map(() => service.getFieldsForType(api, "P", "Task", "k")));

    expect(calls.typeFields).toBe(1);
  });

  test("fetches a schema again once it is older than maxAgeMs", async () => {
    const { api, calls } = countingApi();
    let now = 0;
    const service = new FieldSchemaService({ maxAgeMs: 1000, now: () => now });

    await service.getFieldsForType(api, "P", "Task", "k");
    now = 999;
    await service.getFieldsForType(api, "P", "Task", "k");
    expect(calls).toEqual({ getFields: 1, typeFields: 1 });

    now = 1000;
    await service.getFieldsForType(api, "P", "Task", "k");
    expect(calls).toEqual({ getFields: 2, typeFields: 2 });
  });

  test("a failed fetch isn't cached", async () => {
    let fail = true;
    const api = {
      getFields: async () => {
        if (fail) throw new Error("network");
        return fields;
      },
      getWorkItemTypeFieldsWithReferences: async () => [],
    } as unknown as IWorkItemTrackingApi;
    const service = new FieldSchemaService();

    await expect(service.getAllFields(api, "P", "k")).rejects.toThrow("network");
    fail = false;
    expect(await service.getAllFields(api, "P", "k")).toHaveLength(fields.length);
  });
});
