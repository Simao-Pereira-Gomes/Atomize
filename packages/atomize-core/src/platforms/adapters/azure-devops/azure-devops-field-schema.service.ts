import {
  FieldType,
  type WorkItemField,
  WorkItemTypeFieldsExpandLevel,
  type WorkItemTypeFieldWithReferences,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import type { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import type { ADoFieldSchema, AtoFieldType } from "../../interfaces/field-schema.interface";

type CacheKey = string; // `${profileKey}::${project}::${workItemType|__all__}`

type CacheEntry<T> = { value: Promise<T>; fetchedAt: number };

export interface FieldSchemaServiceOptions {
  /**
   * How long a fetched schema is reused (default 5 minutes). Hosts keep an authenticated adapter
   * for much longer, so this bounds how long a field added or changed in Azure DevOps goes unseen.
   */
  maxAgeMs?: number;
  now?: () => number;
}

/**
 * Caches field schemas as promises, so concurrent requests share one fetch, and a failed fetch is
 * dropped so the next request tries again. The project's field list is fetched once and shared by
 * every Work Item type's schema. Entries older than `maxAgeMs` are fetched again.
 */
export class FieldSchemaService {
  private cache = new Map<CacheKey, CacheEntry<ADoFieldSchema[]>>();
  private projectFields = new Map<CacheKey, CacheEntry<WorkItemField[]>>();
  private readonly maxAgeMs: number;
  private readonly now: () => number;

  constructor(options: FieldSchemaServiceOptions = {}) {
    this.maxAgeMs = options.maxAgeMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Fetch fields for a specific work item type, including allowedValues for picklist fields.
   * Merges WIT-scoped field list with full field metadata to obtain type and readOnly info.
   */
  getFieldsForType(
    witApi: IWorkItemTrackingApi,
    project: string,
    workItemType: string,
    profileKey: string,
  ): Promise<ADoFieldSchema[]> {
    return this.cached(this.cache, `${profileKey}::${project}::${workItemType}`, async () => {
      const [witFields, allFields] = await Promise.all([
        witApi.getWorkItemTypeFieldsWithReferences(project, workItemType, WorkItemTypeFieldsExpandLevel.AllowedValues),
        this.getProjectFields(witApi, project, profileKey),
      ]);
      const fieldMetaByRef = new Map<string, WorkItemField>(
        allFields
          .filter((f): f is WorkItemField & { referenceName: string } => !!f.referenceName)
          .map((f) => [f.referenceName, f]),
      );
      return (witFields ?? []).map((f) => this.mergeField(f, fieldMetaByRef.get(f.referenceName ?? "")));
    });
  }

  /**
   * Fetch all fields in the project (no WIT scope, no allowedValues for picklist fields).
   */
  getAllFields(witApi: IWorkItemTrackingApi, project: string, profileKey: string): Promise<ADoFieldSchema[]> {
    return this.cached(this.cache, `${profileKey}::${project}::__all__`, async () =>
      (await this.getProjectFields(witApi, project, profileKey)).map((f) => this.mapWorkItemField(f)),
    );
  }

  clearCache(): void {
    this.cache.clear();
    this.projectFields.clear();
  }

  private getProjectFields(witApi: IWorkItemTrackingApi, project: string, profileKey: string): Promise<WorkItemField[]> {
    return this.cached(this.projectFields, `${profileKey}::${project}`, async () => (await witApi.getFields(project)) ?? []);
  }

  private cached<T>(cache: Map<CacheKey, CacheEntry<T>>, key: CacheKey, load: () => Promise<T>): Promise<T> {
    const existing = cache.get(key);
    if (existing && this.now() - existing.fetchedAt < this.maxAgeMs) return existing.value;
    const entry: CacheEntry<T> = { value: load(), fetchedAt: this.now() };
    cache.set(key, entry);
    entry.value.catch(() => {
      if (cache.get(key) === entry) cache.delete(key);
    });
    return entry.value;
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
    const type = isIdentity ? "identity" : this.mapFieldType(fieldType);
    return {
      referenceName,
      name: witField.name ?? meta?.name ?? referenceName,
      type,
      isCustom: referenceName.startsWith("Custom."),
      isReadOnly: meta?.readOnly ?? false,
      isMultiline: !isPicklist && (fieldType === FieldType.Html || fieldType === FieldType.PlainText),
      isPicklist,
      allowedValues,
      allowsCustomValues: isPicklist ? meta?.isPicklistSuggested === true : type === "string",
    };
  }

  private mapWorkItemField(f: WorkItemField): ADoFieldSchema {
    const referenceName = f.referenceName ?? "";
    const isIdentity = (f as WorkItemField & { isIdentity?: boolean }).isIdentity === true
      || f.type === FieldType.Identity;
    const type = isIdentity ? "identity" : this.mapFieldType(f.type);
    return {
      referenceName,
      name: f.name ?? referenceName,
      type,
      isCustom: referenceName.startsWith("Custom."),
      isReadOnly: f.readOnly ?? false,
      isMultiline: !f.isPicklist && (f.type === FieldType.Html || f.type === FieldType.PlainText),
      isPicklist: f.isPicklist ?? false,
      allowedValues: undefined,
      allowsCustomValues: f.isPicklist ? f.isPicklistSuggested === true : type === "string",
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
