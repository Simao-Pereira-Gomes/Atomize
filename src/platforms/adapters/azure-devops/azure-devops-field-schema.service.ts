import {
  FieldType,
  type WorkItemField,
  WorkItemTypeFieldsExpandLevel,
  type WorkItemTypeFieldWithReferences,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import type { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import type { ADoFieldSchema, AtoFieldType } from "../../interfaces/field-schema.interface";

type CacheKey = string; // `${profileKey}::${project}::${workItemType|__all__}`

export class FieldSchemaService {
  private cache = new Map<CacheKey, ADoFieldSchema[]>();

  /**
   * Fetch fields for a specific work item type, including allowedValues for picklist fields.
   * Merges WIT-scoped field list with full field metadata to obtain type and readOnly info.
   */
  async getFieldsForType(
    witApi: IWorkItemTrackingApi,
    project: string,
    workItemType: string,
    profileKey: string,
  ): Promise<ADoFieldSchema[]> {
    const key: CacheKey = `${profileKey}::${project}::${workItemType}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const [witFields, allFields] = await Promise.all([
      witApi.getWorkItemTypeFieldsWithReferences(
        project,
        workItemType,
        WorkItemTypeFieldsExpandLevel.AllowedValues,
      ),
      witApi.getFields(project),
    ]);

    const fieldMetaByRef = new Map<string, WorkItemField>(
      (allFields ?? [])
        .filter((f): f is WorkItemField & { referenceName: string } => !!f.referenceName)
        .map(f => [f.referenceName, f]),
    );

    const schemas = (witFields ?? []).map(f =>
      this.mergeField(f, fieldMetaByRef.get(f.referenceName ?? "")),
    );

    this.cache.set(key, schemas);
    return schemas;
  }

  /**
   * Fetch all fields in the project (no WIT scope, no allowedValues for picklist fields).
   */
  async getAllFields(
    witApi: IWorkItemTrackingApi,
    project: string,
    profileKey: string,
  ): Promise<ADoFieldSchema[]> {
    const key: CacheKey = `${profileKey}::${project}::__all__`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const fields = await witApi.getFields(project);
    const schemas = (fields ?? []).map(f => this.mapWorkItemField(f));

    this.cache.set(key, schemas);
    return schemas;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private mergeField(
    witField: WorkItemTypeFieldWithReferences,
    meta: WorkItemField | undefined,
  ): ADoFieldSchema {
    const referenceName = witField.referenceName ?? "";
    const fieldType = meta?.type;
    const allowedValues =
      witField.allowedValues && witField.allowedValues.length > 0
        ? (witField.allowedValues as string[])
        : undefined;

    const isPicklist = !!(allowedValues ?? meta?.isPicklist);
    const isIdentity = (meta as (WorkItemField & { isIdentity?: boolean }) | undefined)?.isIdentity === true
      || fieldType === FieldType.Identity;
    return {
      referenceName,
      name: witField.name ?? meta?.name ?? referenceName,
      type: isIdentity ? "identity" : this.mapFieldType(fieldType),
      isCustom: referenceName.startsWith("Custom."),
      isReadOnly: meta?.readOnly ?? false,
      isMultiline: !isPicklist && (fieldType === FieldType.Html || fieldType === FieldType.PlainText),
      isPicklist,
      allowedValues,
    };
  }

  private mapWorkItemField(f: WorkItemField): ADoFieldSchema {
    const referenceName = f.referenceName ?? "";
    const isIdentity = (f as WorkItemField & { isIdentity?: boolean }).isIdentity === true
      || f.type === FieldType.Identity;
    return {
      referenceName,
      name: f.name ?? referenceName,
      type: isIdentity ? "identity" : this.mapFieldType(f.type),
      isCustom: referenceName.startsWith("Custom."),
      isReadOnly: f.readOnly ?? false,
      isMultiline: !f.isPicklist && (f.type === FieldType.Html || f.type === FieldType.PlainText),
      isPicklist: f.isPicklist ?? false,
      allowedValues: undefined,
    };
  }

  private mapFieldType(fieldType: FieldType | undefined): AtoFieldType {
    switch (fieldType) {
      case FieldType.Integer:
      case FieldType.PicklistInteger:
        return "integer";
      case FieldType.Double:
      case FieldType.PicklistDouble:
        return "decimal";
      case FieldType.Boolean:
        return "boolean";
      case FieldType.Identity:
        return "identity";
      case FieldType.DateTime:
        return "datetime";
      default:
        return "string";
    }
  }
}
