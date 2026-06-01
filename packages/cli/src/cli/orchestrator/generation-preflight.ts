import { logger } from "@config/logger";
import type { ProjectMetadataReader } from "@platforms/interfaces/platform-capabilities";
import {
  analyzeTemplateProjectVerification,
  verifyTemplateProject,
} from "@templates/project-verifier";
import type { TaskTemplate } from "@templates/schema";
import chalk from "chalk";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import { createManagedSpinner } from "@/cli/utilities/prompt-utilities";

export async function validateCustomFieldsPreFlight(
  template: TaskTemplate,
  platform: ProjectMetadataReader,
): Promise<void> {
  if (!platform.getFieldSchemas) return;

  const requirements = analyzeTemplateProjectVerification(template);
  if (
    requirements.customFieldTaskCount === 0 &&
    requirements.conditionFieldRefs.length === 0
  ) {
    return;
  }

  const spinner = createManagedSpinner();
  spinner.start("Validating custom fields against ADO schema...");

  const result = await verifyTemplateProject(template, {
    mode: "online",
    platform,
  });

  if (result.errors.length > 0) {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));
    spinner.stop("Custom field validation failed");
    output.print(chalk.red("\n  Custom field errors:\n"));
    for (const error of result.errors) {
      output.print(chalk.red(`  • ${error.path}: ${error.message}`));
    }
    output.cancel("Fix custom field errors before generating.");
    throw new ExitError(ExitCode.Failure);
  }

  for (const warning of result.warnings) {
    logger.warn(`${warning.path}: ${warning.message}`);
  }

  spinner.stop("Custom fields valid ✓");
}
