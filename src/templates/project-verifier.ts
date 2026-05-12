import type {
  ProjectMetadataReader,
  SavedQueryReader,
} from "@platforms/interfaces/platform-capabilities";
import { extractCustomFieldRefs } from "@/core/condition-evaluator.js";
import {
  appendOfflineVerificationWarning,
  verifyTemplateCustomFields,
} from "./custom-field-verifier";
import type { TaskTemplate } from "./schema";
import type { ValidationError, ValidationWarning } from "./validator";

export type ProjectVerificationMode = "offline" | "online";

export interface TemplateProjectVerificationRequirements {
  customFieldTaskCount: number;
  conditionFieldRefs: string[];
  hasSavedQuery: boolean;
  needsOnlineVerification: boolean;
}

export interface TemplateProjectVerificationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  requirements: TemplateProjectVerificationRequirements;
}

export function analyzeTemplateProjectVerification(
  template: TaskTemplate,
): TemplateProjectVerificationRequirements {
  const customFieldTaskCount = template.tasks.filter(
    (task) => task.customFields && Object.keys(task.customFields).length > 0,
  ).length;
  const conditionFieldRefs = Array.from(
    new Set(
      template.tasks.flatMap((task) =>
        task.condition ? extractCustomFieldRefs(task.condition) : [],
      ),
    ),
  );
  const hasSavedQuery = !!(
    template.filter.savedQuery?.id || template.filter.savedQuery?.path
  );

  return {
    customFieldTaskCount,
    conditionFieldRefs,
    hasSavedQuery,
    needsOnlineVerification:
      customFieldTaskCount > 0 ||
      conditionFieldRefs.length > 0 ||
      hasSavedQuery,
  };
}

export async function verifyTemplateProject(
  template: TaskTemplate,
  options: {
    mode: ProjectVerificationMode;
    strict?: boolean;
    platform?: Pick<ProjectMetadataReader, "getFieldSchemas"> & Pick<SavedQueryReader, "listSavedQueries">;
  },
): Promise<TemplateProjectVerificationResult> {
  const requirements = analyzeTemplateProjectVerification(template);
  const result: TemplateProjectVerificationResult = {
    valid: true,
    errors: [],
    warnings: [],
    requirements,
  };

  if (options.mode === "offline") {
    appendOfflineVerificationWarning(
      result,
      requirements.customFieldTaskCount,
      options.strict === true,
    );
    appendOfflineSavedQueryWarning(result, requirements.hasSavedQuery);
    return result;
  }

  if (
    (requirements.customFieldTaskCount > 0 ||
      requirements.conditionFieldRefs.length > 0) &&
    options.platform?.getFieldSchemas
  ) {
    const customFields = await verifyTemplateCustomFields(
      template,
      options.platform.getFieldSchemas.bind(options.platform),
    );
    result.errors.push(...customFields.errors);
    result.warnings.push(...customFields.warnings);
    if (customFields.errors.length > 0) result.valid = false;
  }

  if (requirements.hasSavedQuery && options.platform?.listSavedQueries) {
    const savedQuery = await verifySavedQuery(template, options.platform);
    result.errors.push(...savedQuery.errors);
    result.warnings.push(...savedQuery.warnings);
    if (savedQuery.errors.length > 0) result.valid = false;
  }

  return result;
}

function appendOfflineSavedQueryWarning(
  result: TemplateProjectVerificationResult,
  hasSavedQuery: boolean,
): void {
  if (!hasSavedQuery) return;

  result.warnings.push({
    path: "filter.savedQuery",
    message:
      "Template uses a saved query that could not be verified. " +
      "Run with --profile <name> (or choose Online when prompted) to validate the query exists.",
  });
}

async function verifySavedQuery(
  template: TaskTemplate,
  platform: Pick<SavedQueryReader, "listSavedQueries">,
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const savedQuery = template.filter.savedQuery;
  if (!savedQuery || !platform.listSavedQueries) return { errors, warnings };

  try {
    const queries = await platform.listSavedQueries();

    if (savedQuery.id) {
      const found = queries.some((query) => query.id === savedQuery.id);
      if (!found) {
        errors.push({
          path: "filter.savedQuery.id",
          message: `Saved query with ID "${savedQuery.id}" was not found in this project. Run: atomize queries list`,
          code: "SAVED_QUERY_NOT_FOUND",
        });
      }
    } else if (savedQuery.path) {
      const found = queries.some((query) => query.path === savedQuery.path);
      if (!found) {
        errors.push({
          path: "filter.savedQuery.path",
          message: `Saved query at path "${savedQuery.path}" was not found in this project. Run: atomize queries list`,
          code: "SAVED_QUERY_NOT_FOUND",
        });
      }
    }
  } catch (err) {
    warnings.push({
      path: "filter.savedQuery",
      message: `Could not validate saved query against ADO: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return { errors, warnings };
}
