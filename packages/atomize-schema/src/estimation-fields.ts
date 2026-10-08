/**
 * Which platform fields can take part in estimation. Shared by core (CLI, grounding, Online
 * Validation) and Studio so every surface offers the same fields.
 */

export type EstimationFieldInfo = {
  referenceName: string;
  name: string;
  type: "string" | "integer" | "decimal" | "boolean" | "identity" | "datetime";
  isReadOnly?: boolean;
  isPicklist?: boolean;
  isMultiline?: boolean;
  isCustom?: boolean;
};

/** Platform knowledge supplied by the adapter; patterns ending in ".*" match a whole namespace. */
export type EstimationFieldRules = {
  storyEstimateFields?: readonly string[];
  nonEstimateFields?: readonly string[];
};

export function matchesFieldPattern(referenceName: string, patterns: readonly string[] = []): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith(".*") ? referenceName.startsWith(pattern.slice(0, -1)) : referenceName === pattern,
  );
}

function isPlatformExcluded(field: EstimationFieldInfo, rules?: EstimationFieldRules): boolean {
  return field.referenceName.startsWith("System.") || matchesFieldPattern(field.referenceName, rules?.nonEstimateFields);
}

/**
 * Whether a Story field can supply a Story Estimate: the platform's default estimate fields, or any
 * writable numeric or single-line text field that isn't System.* or a platform non-estimate field.
 */
export function isEstimateSourceField(field: EstimationFieldInfo, rules?: EstimationFieldRules): boolean {
  if (field.isReadOnly) return false;
  if (rules?.storyEstimateFields?.includes(field.referenceName)) return true;
  if (isPlatformExcluded(field, rules)) return false;
  return field.type === "integer" || field.type === "decimal" || (field.type === "string" && !field.isMultiline);
}

/**
 * Whether a Task field can receive the Task Estimate: writable and numeric, not a picklist (a
 * fractional estimate can't be written to one), not System.* and not a platform non-estimate field.
 */
export function isEstimateTargetField(field: EstimationFieldInfo, rules?: EstimationFieldRules): boolean {
  return (
    !field.isReadOnly &&
    !field.isPicklist &&
    (field.type === "integer" || field.type === "decimal") &&
    !isPlatformExcluded(field, rules)
  );
}

/** Custom fields first (where size fields usually live), then the rest, alphabetically by name. */
export function sortEstimateFields<T extends Pick<EstimationFieldInfo, "referenceName" | "name" | "isCustom">>(fields: T[]): T[] {
  const custom = (field: T) => Number(field.isCustom ?? field.referenceName.startsWith("Custom."));
  return [...fields].sort((a, b) => custom(b) - custom(a) || a.name.localeCompare(b.name));
}
