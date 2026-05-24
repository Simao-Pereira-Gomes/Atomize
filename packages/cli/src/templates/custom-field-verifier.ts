import type { ADoFieldSchema } from "@platforms/interfaces/field-schema.interface";
import { extractCustomFieldRefs } from "@/core/condition-evaluator.js";
import type { TaskTemplate } from "./schema";
import type { ValidationError, ValidationWarning } from "./validator";

export interface CustomFieldVerificationSummary {
  count: number;
  verificationStatus: "none" | "offline-unverified" | "online-verified";
}

export interface CustomFieldVerificationResult {
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export async function verifyTemplateCustomFields(
  template: TaskTemplate,
  getSchemas: (workItemType: string) => Promise<ADoFieldSchema[]>,
): Promise<CustomFieldVerificationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const taskSchemas = await getSchemas("Task");
  const schemaByRef = new Map(taskSchemas.map((field) => [field.referenceName, field]));

  for (let i = 0; i < template.tasks.length; i++) {
    const task = template.tasks[i];
    if (!task?.customFields || Object.keys(task.customFields).length === 0) continue;

    for (const [refName, value] of Object.entries(task.customFields)) {
      const path = `tasks[${i}].customFields["${refName}"]`;
      const schema = schemaByRef.get(refName);

      if (!schema) {
        errors.push({
          path,
          message: `Field "${refName}" not found for work item type "Task".`,
          code: "CUSTOM_FIELD_NOT_FOUND",
        });
        continue;
      }

      if (schema.isReadOnly) {
        errors.push({
          path,
          message: `Field "${refName}" is read-only and cannot be set.`,
          code: "CUSTOM_FIELD_READ_ONLY",
        });
        continue;
      }

      if (typeof value === "string" && value.includes("{{")) continue;

      if (schema.allowedValues && schema.allowedValues.length > 0) {
        const strValue = String(value);
        if (!schema.allowedValues.includes(strValue)) {
          errors.push({
            path,
            message: `Value "${strValue}" is not in the allowed values for "${refName}": [${schema.allowedValues.join(", ")}].`,
            code: "CUSTOM_FIELD_INVALID_PICKLIST_VALUE",
          });
        }
        continue;
      }

      const typeError = checkValueType(refName, value, schema.type, path);
      if (typeError) errors.push(typeError);

      if (
        !schema.isMultiline &&
        schema.type === "string" &&
        typeof value === "string" &&
        value.includes("\n")
      ) {
        warnings.push({
          path,
          message: `Field "${refName}" is a single-line field but the value contains newlines. ADO may strip or reject them.`,
        });
      }
    }
  }

  await verifyConditionFieldReferences(template, getSchemas, errors, warnings);

  return { errors, warnings };
}

export function checkValueType(
  refName: string,
  value: string | number | boolean,
  type: ADoFieldSchema["type"],
  path: string,
): ValidationError | undefined {
  switch (type) {
    case "integer": {
      const n = Number(value);
      if (typeof value !== "number" && !Number.isFinite(n)) {
        return { path, message: `Field "${refName}" expects an integer, got "${value}".`, code: "CUSTOM_FIELD_TYPE_MISMATCH" };
      }
      if (Number.isFinite(n) && !Number.isInteger(n)) {
        return { path, message: `Field "${refName}" expects a whole number, got "${value}".`, code: "CUSTOM_FIELD_TYPE_MISMATCH" };
      }
      return undefined;
    }
    case "decimal":
      if (typeof value !== "number" && !Number.isFinite(Number(value))) {
        return { path, message: `Field "${refName}" expects a decimal number, got "${value}".`, code: "CUSTOM_FIELD_TYPE_MISMATCH" };
      }
      return undefined;
    case "boolean":
      if (typeof value !== "boolean" && value !== "true" && value !== "false") {
        return {
          path,
          message: `Field "${refName}" expects a boolean (true/false), got "${value}".`,
          code: "CUSTOM_FIELD_TYPE_MISMATCH",
        };
      }
      return undefined;
    case "datetime": {
      const DATE_OR_MACRO_RE =
        /^(@Today|@StartOfDay|@StartOfMonth|@StartOfWeek|@StartOfYear)(\s*[+-]\s*\d+)?$|^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/i;
      if (typeof value === "string" && !DATE_OR_MACRO_RE.test(value)) {
        return {
          path,
          message: `Field "${refName}" expects an ISO 8601 date or @Today macro, got "${value}".`,
          code: "CUSTOM_FIELD_TYPE_MISMATCH",
        };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

export function getCustomFieldVerificationSummary(
  template: TaskTemplate,
  connectionMode: "offline" | "online",
): CustomFieldVerificationSummary {
  const count = template.tasks.reduce((sum, task) => {
    return sum + Object.keys(task.customFields ?? {}).length;
  }, 0);

  if (count === 0) {
    return {
      count: 0,
      verificationStatus: "none",
    };
  }

  return {
    count,
    verificationStatus:
      connectionMode === "online" ? "online-verified" : "offline-unverified",
  };
}

export function appendOfflineVerificationWarning(
  result: {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  },
  customFieldTaskCount: number,
  strict: boolean,
): void {
  if (customFieldTaskCount === 0) return;

  const warning: ValidationWarning = {
    path: "tasks[*].customFields",
    message:
      `${customFieldTaskCount} task(s) have custom fields that could not be verified. ` +
      "Run with --profile <name> (or choose Online when prompted) to validate field names, types, and picklist values.",
  };

  if (strict) {
    result.errors.push({
      path: warning.path,
      message: warning.message,
      code: "STRICT_MODE_WARNING",
    });
    result.valid = false;
    return;
  }

  result.warnings.push(warning);
}

async function verifyConditionFieldReferences(
  template: TaskTemplate,
  getSchemas: (workItemType: string) => Promise<ADoFieldSchema[]>,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): Promise<void> {
  const conditionRefs = Array.from(
    new Set(
      template.tasks.flatMap((task) =>
        task.condition ? extractCustomFieldRefs(task.condition) : [],
      ),
    ),
  );

  if (conditionRefs.length === 0) return;

  const workItemTypes = template.filter.workItemTypes;
  if (!workItemTypes || workItemTypes.length === 0) {
    warnings.push({
      path: "tasks[*].condition",
      message:
        "Template has task conditions referencing custom fields but no workItemTypes filter is set — cannot verify condition field references.",
    });
    return;
  }

  const storySchemasByWit = new Map<string, Map<string, ADoFieldSchema>>();
  for (const wit of workItemTypes) {
    const witSchemas = await getSchemas(wit);
    storySchemasByWit.set(wit, new Map(witSchemas.map((field) => [field.referenceName, field])));
  }

  for (const ref of conditionRefs) {
    for (const wit of workItemTypes) {
      const witSchemaMap = storySchemasByWit.get(wit);
      if (witSchemaMap && !witSchemaMap.has(ref)) {
        errors.push({
          path: "tasks[*].condition",
          message: `Field "${ref}" referenced in a task condition was not found on work item type "${wit}".`,
          code: "CONDITION_FIELD_NOT_FOUND",
        });
      }
    }
  }
}
