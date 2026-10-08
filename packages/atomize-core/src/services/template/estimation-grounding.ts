import type { EstimationDefaults } from "../../platforms/interfaces/estimation-defaults.interface";
import type { ADoFieldSchema } from "../../platforms/interfaces/field-schema.interface";

export interface EstimationGrounding {
  /** The platform's default Estimation Field Mapping, so a draft only overrides what differs. */
  defaults: {
    storyEstimateFields: string[];
    taskWorkItemType: string;
    taskEstimateFields: string[];
    unitLabel?: string;
  };
  /** Per Story type, the fields that could supply a Story Estimate, with picklist values. */
  storyEstimateFieldsByWorkItemType: Record<string, Array<Pick<ADoFieldSchema, "referenceName" | "name" | "type" | "isPicklist" | "allowedValues">>>;
}

/**
 * Whether a Story field could supply a Story Estimate: any writable numeric or single-line text
 * field (picklist or free text, custom or process-defined), except System.* plumbing fields.
 * The `defaults` argument is kept for callers that pass the platform chain; those fields qualify too.
 */
export function isEstimateCapableField(field: ADoFieldSchema, defaults: Pick<EstimationDefaults, "storyEstimateFields">): boolean {
  if (field.isReadOnly) return false;
  if (defaults.storyEstimateFields.includes(field.referenceName)) return true;
  if (field.referenceName.startsWith("System.")) return false;
  return field.type === "integer" || field.type === "decimal" || (field.type === "string" && !field.isMultiline);
}

/** Custom fields first (where size fields usually live), then the rest, alphabetically. */
export function sortEstimateFields<T extends Pick<ADoFieldSchema, "isCustom" | "name">>(fields: T[]): T[] {
  return [...fields].sort((a, b) => Number(b.isCustom) - Number(a.isCustom) || a.name.localeCompare(b.name));
}

/**
 * Curates the metadata an AI draft needs to configure estimation: the platform defaults and
 * the fields that can carry a Story Estimate (the default chain, plus writable custom numeric
 * or picklist fields such as a t-shirt size). Metadata only, never credentials (ADR 0045).
 */
export function buildEstimationGrounding(
  defaults: EstimationDefaults,
  fieldsByWorkItemType: Record<string, ADoFieldSchema[]>,
): EstimationGrounding {
  const isEstimateCapable = (field: ADoFieldSchema) => isEstimateCapableField(field, defaults);

  const storyEntries: Array<[string, EstimationGrounding["storyEstimateFieldsByWorkItemType"][string]]> = [];
  for (const [type, fields] of Object.entries(fieldsByWorkItemType)) {
    if (type === defaults.taskWorkItemType) continue;
    const capable = sortEstimateFields(fields.filter(isEstimateCapable)).map(({ referenceName, name, type: fieldType, isPicklist, allowedValues }) => ({
      referenceName,
      name,
      type: fieldType,
      isPicklist,
      ...(allowedValues ? { allowedValues } : {}),
    }));
    if (capable.length > 0) storyEntries.push([type, capable]);
  }

  return {
    defaults: {
      storyEstimateFields: [...defaults.storyEstimateFields],
      taskWorkItemType: defaults.taskWorkItemType,
      taskEstimateFields: [...defaults.taskEstimateFields],
      ...(defaults.unitLabel ? { unitLabel: defaults.unitLabel } : {}),
    },
    storyEstimateFieldsByWorkItemType: Object.fromEntries(storyEntries),
  };
}
