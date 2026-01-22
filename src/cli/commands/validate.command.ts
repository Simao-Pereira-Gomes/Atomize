import { logger } from "@config/logger";
import { TemplateLoader } from "@templates/loader";
import {
  TemplateValidator,
  type ValidationError,
  type ValidationOptions,
  type ValidationResult,
  type ValidationWarning,
} from "@templates/validator";
import chalk from "chalk";
import { Command } from "commander";
import type { TaskDefinition, TaskTemplate, ValidationMode } from "@/templates/schema";

type ValidateOptions = {
  verbose?: boolean;
  strict?: boolean;
  lenient?: boolean;
};

export const validateCommand = new Command("validate")
  .description("Validate a template file")
  .argument("<template>", "Path to template file (YAML)")
  .option("-v, --verbose", "Show detailed validation information", false)
  .option("-s, --strict", "Use strict validation mode (warnings become errors)", false)
  .option("-l, --lenient", "Use lenient validation mode (default)", false)
  .action(async (templatePath: string, options: ValidateOptions) => {
    console.log(chalk.blue("Atomize Template Validator\n"));
    try {
      const template = await loadTemplate(templatePath);
      if (options.verbose) printTemplateDetails(template);

      const validationOptions = resolveValidationOptions(options);
      const result = validateTemplate(template, validationOptions);

      printValidationResult(template, result);
      if (!result.valid) process.exit(1);
    } catch (error) {
      handleFatal(error, options.verbose);
      process.exit(1);
    }
  });

function resolveValidationOptions(options: ValidateOptions): ValidationOptions {
  // CLI flags override template config
  // --strict and --lenient are mutually exclusivea and strict takes precedence
  if (options.strict) {
    return { mode: "strict" };
  }
  if (options.lenient) {
    return { mode: "lenient" };
  }
  // No override: let validator use template config or default
  return {};
}

async function loadTemplate(templatePath: string) {
  logger.info(`Loading template: ${templatePath}`);
  const loader = new TemplateLoader();
  const template = await loader.load(templatePath);
  logger.info(`Template loaded: ${template.name}`);
  return template;
}

function validateTemplate(template: unknown, options?: ValidationOptions) {
  logger.info("Validating template...");
  const validator = new TemplateValidator();
  return validator.validate(template, options);
}

function printTemplateDetails(template: TaskTemplate) {
  console.log(chalk.gray(`Description: ${template.description || "N/A"}`));
  console.log(chalk.gray(`Version: ${template.version}`));
  console.log(chalk.gray(`Tasks: ${template.tasks.length}\n`));
}

function printValidationResult(
  template: TaskTemplate,
  result: ValidationResult
) {
  console.log("");

  if (result.valid) {
    printValidSummary(template, result.warnings, result.mode);
    return;
  }

  printInvalidSummary(result.errors, result.warnings, result.mode);
}

function printValidSummary(
  template: TaskTemplate,
  warnings: ValidationWarning[],
  mode: ValidationMode
) {
  const modeLabel = mode === "strict" ? chalk.yellow("[Strict]") : chalk.gray("[Lenient]");
  console.log(chalk.green("Template is valid!") + ` ${modeLabel}\n`);

  const summary = getTemplateSummary(template);

  console.log(chalk.bold("Summary:"));
  console.log(`  Name: ${chalk.cyan(summary.name)}`);
  console.log(`  Tasks: ${chalk.cyan(summary.tasks)}`);
  console.log(`  Total Estimation: ${chalk.cyan(summary.totalEstimation)}`);

  printWarnings(warnings);

  console.log(`\n ${chalk.green("Ready to use with atomize generate")}`);
}

function printInvalidSummary(
  errors: ValidationError[],
  warnings: ValidationWarning[],
  mode: ValidationMode
) {
  const modeLabel = mode === "strict" ? chalk.yellow("[Strict]") : chalk.gray("[Lenient]");
  console.log(chalk.red("Template validation failed") + ` ${modeLabel}\n`);

  console.log(chalk.red.bold("Errors:"));
  errors.forEach((err) => {
    console.log(chalk.red(`  • ${err.path}: ${err.message}`));
  });

  printWarnings(warnings, true);

  console.log(`\n${chalk.gray("Fix the errors above and try again.")}`);
}

function printWarnings(warnings: ValidationWarning[], boldTitle = false) {
  if (!warnings?.length) return;

  console.log("");
  console.log(
    boldTitle ? chalk.yellow.bold("Warnings:") : chalk.yellow("Warnings:")
  );

  warnings.forEach((warn) => {
    console.log(chalk.yellow(`  • ${warn.path}: ${warn.message}`));
  });
}

function getTemplateSummary(template: TaskTemplate) {
  const totalPercent = template.tasks
    .filter((t: TaskDefinition) => !t.condition)
    .reduce(
      (sum: number, task: TaskDefinition) =>
        sum + (task.estimationPercent ?? 0),
      0
    );

  return {
    name: template.name,
    tasks: template.tasks.length,
    totalEstimation: `${totalPercent}%`,
  };
}

function handleFatal(error: unknown, verbose?: boolean) {
  console.log("");
  logger.error(chalk.red("Validation failed"));

  const message = error instanceof Error ? error.message : String(error);
  console.log(chalk.red(message));

  if (verbose && error instanceof Error && error.stack) {
    console.log("");
    console.log(chalk.gray(error.stack));
  }
}
