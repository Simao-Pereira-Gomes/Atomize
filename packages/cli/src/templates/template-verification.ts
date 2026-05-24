import type {
  ProjectMetadataReader,
  SavedQueryReader,
} from "@platforms/interfaces/platform-capabilities";
import {
  analyzeTemplateProjectVerification,
  type ProjectVerificationMode,
  type TemplateProjectVerificationRequirements,
  verifyTemplateProject,
} from "./project-verifier";
import type { TaskTemplate } from "./schema";
import { TemplateValidator, type ValidationOptions, type ValidationResult } from "./validator";

export interface TemplateVerificationOptions {
  validation?: ValidationOptions;
  project?: {
    mode: ProjectVerificationMode;
    strict?: boolean;
    platform?: Pick<ProjectMetadataReader, "getFieldSchemas"> &
      Pick<SavedQueryReader, "listSavedQueries">;
  };
}

export interface TemplateVerificationResult extends ValidationResult {
  requirements: TemplateProjectVerificationRequirements;
}

/**
 * Verifies a Template for a caller-selected mode.
 *
 * Structural schema checks and project-reference checks both produce the same
 * ValidationResult shape, so callers can present one coherent outcome instead
 * of merging errors and warnings themselves.
 */
export async function verifyTemplate(
  template: TaskTemplate,
  options: TemplateVerificationOptions = {},
): Promise<TemplateVerificationResult> {
  const validator = new TemplateValidator();
  const structural = validator.validate(template, options.validation);
  const requirements = analyzeTemplateProjectVerification(template);
  const result: TemplateVerificationResult = {
    ...structural,
    errors: [...structural.errors],
    warnings: [...structural.warnings],
    requirements,
  };

  if (!options.project) return result;

  const project = await verifyTemplateProject(template, options.project);
  result.errors.push(...project.errors);
  result.warnings.push(...project.warnings);
  if (project.errors.length > 0) {
    result.valid = false;
  }

  return result;
}
