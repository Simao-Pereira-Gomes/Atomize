import type { Condition, ConditionOperator } from "@sppg2001/atomize-schema";
import type { GroundedTaskField } from "../../grounding/grounding-service";

const STORY_FIELD_OPERATOR_TYPES: Record<string, "picklist" | "numeric" | "identity"> = {
  state: "picklist",
  type: "picklist",
  estimation: "numeric",
  priority: "numeric",
  assignedTo: "identity",
};

export function operatorsForCondition(
  condition: Extract<Condition, { field: string } | { customField: string }>,
  groundedFields?: GroundedTaskField[],
): ConditionOperator[] {
  if ("field" in condition && condition.field === "tags") return ["contains", "not-contains"];
  const groundedField = "customField" in condition
    ? groundedFields?.find((field) => field.referenceName === condition.customField)
    : undefined;
  if (groundedField) {
    if (groundedField.isPicklist || groundedField.type === "boolean") return ["equals", "not-equals"];
    if (groundedField.type === "string" || groundedField.type === "identity") return ["equals", "not-equals", "contains", "not-contains"];
    return ["equals", "not-equals", "gt", "lt", "gte", "lte"];
  }
  if ("field" in condition) {
    const storyType = STORY_FIELD_OPERATOR_TYPES[condition.field];
    if (storyType === "picklist") return ["equals", "not-equals"];
    if (storyType === "numeric") return ["equals", "not-equals", "gt", "lt", "gte", "lte"];
    if (storyType === "identity") return ["equals", "not-equals", "contains", "not-contains"];
  }
  return ["equals", "not-equals", "contains", "not-contains"];
}
