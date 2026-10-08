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
