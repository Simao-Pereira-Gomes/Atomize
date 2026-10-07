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

/** Whether a Story field could supply a Story Estimate: the default chain, or a writable custom numeric or picklist field. */
export function isEstimateCapableField(field: ADoFieldSchema, defaults: Pick<EstimationDefaults, "storyEstimateFields">): boolean {
  return (
    !field.isReadOnly &&
    (defaults.storyEstimateFields.includes(field.referenceName) ||
      (field.isCustom && (field.type === "integer" || field.type === "decimal" || (field.type === "string" && field.isPicklist))))
  );
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
    const capable = fields.filter(isEstimateCapable).map(({ referenceName, name, type: fieldType, isPicklist, allowedValues }) => ({
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
