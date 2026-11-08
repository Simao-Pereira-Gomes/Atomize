import { extractCustomFieldRefs } from "../core/condition-evaluator.js";
import type { EstimationDefaultsProvider } from "../platforms/interfaces/estimation-defaults.interface";
import type {
  ProjectMetadataReader,
  SavedQueryReader,
} from "../platforms/interfaces/platform-capabilities";
import {
  appendOfflineVerificationWarning,
  verifyTemplateCustomFields,
} from "./custom-field-verifier";
import { hasEstimationMappingOverrides, verifyEstimationMapping } from "./estimation-verifier";
import type { TaskTemplate } from "./schema";
import {
  TemplateValidator,
  type ValidationError,
  type ValidationOptions,
  type ValidationResult,
  type ValidationWarning,
} from "./validator";

export {
  type CustomFieldVerificationSummary,
  getCustomFieldVerificationSummary,
} from "./custom-field-verifier";

/**
 * Offline Validation checks structure only and reports which project references it could not
 * check. Online Validation also checks custom fields, condition fields, the saved query and the
 * estimation mapping against the platform's project metadata.
 */
export type ProjectVerificationMode = "offline" | "online";

/** The project metadata Online Validation reads. */
export type ProjectVerificationPlatform = Pick<ProjectMetadataReader, "getFieldSchemas" | "getWorkItemTypes"> &
  Pick<SavedQueryReader, "listSavedQueries"> &
  Partial<EstimationDefaultsProvider>;

export interface ProjectVerificationOptions {
  mode: ProjectVerificationMode;
  strict?: boolean;
  /** Online Validation without a platform (it could not be reached) checks no project references. */
  platform?: ProjectVerificationPlatform;
}

export interface TemplateVerificationOptions {
  validation?: ValidationOptions;
  project?: ProjectVerificationOptions;
}

export interface TemplateProjectVerificationRequirements {
  customFieldTaskCount: number;
  conditionFieldRefs: string[];
  hasSavedQuery: boolean;
  hasEstimationMapping: boolean;
  needsOnlineVerification: boolean;
}

export interface ProjectReferenceIssues {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface TemplateVerificationResult extends ValidationResult {
  requirements: TemplateProjectVerificationRequirements;
  /** The project-reference issues on their own (also included in errors and warnings); absent when not checked. */
  project?: ProjectReferenceIssues;
}

/**
 * Verifies a Template: structural validation, plus Offline or Online Validation of its project
 * references when `project` is given. One result holds every error and warning.
 */
export async function verifyTemplate(
  template: TaskTemplate,
  options: TemplateVerificationOptions = {},
): Promise<TemplateVerificationResult> {
  const structural = new TemplateValidator().validate(template, options.validation);
  const requirements = analyzeTemplateProjectVerification(template);
  const result: TemplateVerificationResult = {
    ...structural,
    errors: [...structural.errors],
    warnings: [...structural.warnings],
    requirements,
  };

  if (!options.project) return result;

  const project = await verifyProjectReferences(template, options.project, requirements);
  result.project = project;
  result.errors.push(...project.errors);
  result.warnings.push(...project.warnings);
  if (project.errors.length > 0) {
    result.valid = false;
  }

  return result;
}

/** Which project references a Template has, and so whether Online Validation would check anything. */
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
    template.filter?.savedQuery?.id || template.filter?.savedQuery?.path
  );

  const hasEstimationMapping = hasEstimationMappingOverrides(template);

  return {
    customFieldTaskCount,
    conditionFieldRefs,
    hasSavedQuery,
    hasEstimationMapping,
    needsOnlineVerification:
      customFieldTaskCount > 0 ||
      conditionFieldRefs.length > 0 ||
      hasSavedQuery ||
      hasEstimationMapping,
  };
}

async function verifyProjectReferences(
  template: TaskTemplate,
  options: ProjectVerificationOptions,
  requirements: TemplateProjectVerificationRequirements,
): Promise<ProjectReferenceIssues> {
  const result: ProjectReferenceIssues = { valid: true, errors: [], warnings: [] };

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
      template.taskType ?? options.platform.getEstimationDefaults?.().taskWorkItemType,
    );
    result.errors.push(...customFields.errors);
    result.warnings.push(...customFields.warnings);
    if (customFields.errors.length > 0) result.valid = false;
  }

  const platform = options.platform;
  if (requirements.hasEstimationMapping && platform?.getFieldSchemas) {
    const estimation = await verifyEstimationMapping(template, {
      getFieldSchemas: platform.getFieldSchemas.bind(platform),
      getWorkItemTypes: platform.getWorkItemTypes?.bind(platform),
      getEstimationDefaults: platform.getEstimationDefaults?.bind(platform),
    });
    result.errors.push(...estimation.errors);
    if (options.strict === true || template.validation?.mode === "strict") {
      result.errors.push(
        ...estimation.warnings.map((w) => ({ path: w.path, message: w.message, suggestion: w.suggestion, code: "STRICT_MODE_WARNING" })),
      );
    } else {
      result.warnings.push(...estimation.warnings);
    }
    if (result.errors.length > 0) result.valid = false;
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
  result: ProjectReferenceIssues,
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
