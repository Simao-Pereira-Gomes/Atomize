import type { EstimationDefaults } from "../platforms/interfaces/estimation-defaults.interface";
import type { ADoFieldSchema } from "../platforms/interfaces/field-schema.interface";
import { type Condition, lookupTableEstimate, type TaskTemplate } from "./schema";
import type { ValidationError, ValidationWarning } from "./validator";

export interface EstimationVerificationPlatform {
  getFieldSchemas(workItemType?: string): Promise<ADoFieldSchema[]>;
  getWorkItemTypes?(): Promise<string[]>;
  getEstimationDefaults?(): EstimationDefaults;
}

export interface EstimationVerificationResult {
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const NUMERIC_TYPES = new Set<ADoFieldSchema["type"]>(["integer", "decimal"]);
const NUMERIC_OPERATORS = new Set(["gt", "lt", "gte", "lte"]);

export function hasEstimationMappingOverrides(template: TaskTemplate): boolean {
  return !!(template.taskType || template.estimation?.source || template.estimation?.targetFields?.length);
}

/**
 * Online checks of a Template's Estimation Field Mapping overrides against the connected
 * project. Coverage gaps are warnings, because at runtime they only leave Task Estimates blank.
 */
export async function verifyEstimationMapping(
  template: TaskTemplate,
  platform: EstimationVerificationPlatform,
): Promise<EstimationVerificationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  if (!hasEstimationMappingOverrides(template)) return { errors, warnings };

  const taskType = template.taskType ?? platform.getEstimationDefaults?.().taskWorkItemType;
  const taskTypeExists = await verifyTaskType(template, platform, errors);

  const targetFields = template.estimation?.targetFields ?? [];
  if (targetFields.length > 0 && taskType && taskTypeExists) {
    const taskFields = byReference(await platform.getFieldSchemas(taskType));
    targetFields.forEach((ref, i) => {
      const path = `estimation.targetFields[${i}]`;
      const field = taskFields.get(ref);
      if (!field) {
        errors.push({ path, message: `Field "${ref}" not found for work item type "${taskType}".`, code: "ESTIMATION_TARGET_FIELD_NOT_FOUND" });
      } else if (!NUMERIC_TYPES.has(field.type)) {
        errors.push({
          path,
          message: `Field "${ref}" is a ${field.type} field; Task Estimates can only be written to numeric fields.`,
          code: "ESTIMATION_TARGET_FIELD_NOT_NUMERIC",
        });
      }
    });
  }

  const source = template.estimation?.source;
  if (source) {
    const sourceField = await verifySourceField(template, source, platform, errors);
    if (sourceField) checkSourceValues(template, sourceField, warnings);
  }

  return { errors, warnings };
}

async function verifyTaskType(
  template: TaskTemplate,
  platform: EstimationVerificationPlatform,
  errors: ValidationError[],
): Promise<boolean> {
  if (!template.taskType || !platform.getWorkItemTypes) return true;
  const types = await platform.getWorkItemTypes();
  if (types.includes(template.taskType)) return true;
  errors.push({
    path: "taskType",
    message: `Work item type "${template.taskType}" does not exist in this project. Available types: ${types.join(", ")}.`,
    code: "ESTIMATION_TASK_TYPE_NOT_FOUND",
  });
  return false;
}

async function verifySourceField(
  template: TaskTemplate,
  source: string,
  platform: EstimationVerificationPlatform,
  errors: ValidationError[],
): Promise<ADoFieldSchema | undefined> {
  const storyTypes = template.filter.workItemTypes?.length ? template.filter.workItemTypes : [undefined];
  let found: ADoFieldSchema | undefined;
  for (const storyType of storyTypes) {
    const field = byReference(await platform.getFieldSchemas(storyType)).get(source);
    if (field) {
      found ??= field;
      continue;
    }
    errors.push({
      path: "estimation.source",
      message: storyType
        ? `Field "${source}" not found for work item type "${storyType}".`
        : `Field "${source}" not found in this project.`,
      code: "ESTIMATION_SOURCE_NOT_FOUND",
    });
  }
  return found;
}

function checkSourceValues(template: TaskTemplate, field: ADoFieldSchema, warnings: ValidationWarning[]): void {
  const table = template.estimation?.conversion?.table;
  const multipliers = template.estimation?.conversion?.multipliers === true;
  const allowed = field.isPicklist ? field.allowedValues ?? [] : [];

  if (table && allowed.length > 0) {
    const keys = Object.keys(table);
    const uncovered = allowed.filter((value) => lookupTableEstimate(value, table, multipliers) === undefined);
    if (uncovered.length > 0) {
      warnings.push({
        path: "estimation.conversion.table",
        message: `${listValues(uncovered)} ${uncovered.length === 1 ? "is a valid value" : "are valid values"} of "${field.referenceName}" but ${uncovered.length === 1 ? "has" : "have"} no conversion; Stories with ${uncovered.length === 1 ? "it" : "them"} will get blank Task Estimates.`,
        suggestion: "Add the missing values to conversion.table.",
      });
    }
    const usedThroughMultiplier = (key: string) =>
      multipliers && allowed.some((value) => value !== key && lookupTableEstimate(value, { [key]: 1 }, true) !== undefined);
    const unknown = keys.filter((key) => !allowed.includes(key) && !usedThroughMultiplier(key));
    if (unknown.length > 0) {
      warnings.push({
        path: "estimation.conversion.table",
        message: `conversion.table ${unknown.length === 1 ? "key" : "keys"} ${listValues(unknown)} ${unknown.length === 1 ? "is not an allowed value" : "are not allowed values"} of "${field.referenceName}" and will never match.`,
        suggestion: `Allowed values: ${listValues(allowed)}.`,
      });
    }
  }

  if (field.type === "string" && field.allowsCustomValues) {
    const consequence = multipliers
      ? "any value that neither matches a conversion table key nor parses as a number followed by a key will leave Tasks unestimated."
      : "any value not in the conversion table will leave Tasks unestimated.";
    warnings.push({
      path: "estimation.source",
      message: field.isPicklist
        ? `"${field.referenceName}" is a suggested picklist that also accepts values outside its list; ${consequence}`
        : `"${field.referenceName}" is a free-text field; ${consequence}`,
    });
  }

  if (field.type === "string") {
    template.tasks.forEach((task, i) => {
      const conditions: Array<[string, Condition | undefined]> = [
        [`tasks[${i}].condition`, task.condition],
        ...(task.estimationPercentCondition ?? []).map(
          (rule, j): [string, Condition | undefined] => [`tasks[${i}].estimationPercentCondition[${j}].condition`, rule.condition],
        ),
      ];
      for (const [path, condition] of conditions) {
        if (condition && usesNumericOperatorOnEstimation(condition)) {
          warnings.push({
            path,
            message: `This condition compares estimation numerically, but "${field.referenceName}" holds text values; it will skip the task for any non-numeric Story Estimate.`,
            suggestion: "Use equals or not-equals with the category values instead.",
          });
        }
      }
    });
  }
}

function usesNumericOperatorOnEstimation(condition: Condition): boolean {
  if ("all" in condition) return condition.all.some(usesNumericOperatorOnEstimation);
  if ("any" in condition) return condition.any.some(usesNumericOperatorOnEstimation);
  return "field" in condition && condition.field === "estimation" && NUMERIC_OPERATORS.has(condition.operator);
}

function byReference(fields: ADoFieldSchema[]): Map<string, ADoFieldSchema> {
  return new Map(fields.map((field) => [field.referenceName, field]));
}

function listValues(values: string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}
