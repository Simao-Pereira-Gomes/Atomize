import { cancel, intro, outro } from "@clack/prompts";
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
import { ExitCode } from "@/cli/utilities/exit-codes";
import type {
  TaskDefinition,
  TaskTemplate,
  ValidationMode,
} from "@/templates/schema";

type ValidateOptions = {
  strict?: boolean;
  quiet?: boolean;
};

export const validateCommand = new Command("validate")
  .description("Validate a template file")
  .argument("<template>", "Path to template file (YAML)")
  .option(
    "-s, --strict",
    "Use strict validation mode (warnings become errors)",
    false,
  )
  .option("-q, --quiet", "Suppress non-essential output", false)
  .action(async (templatePath: string, options: ValidateOptions) => {
    intro(" Atomize — Template Validator");
    try {
      const template = await loadTemplate(templatePath);

      const validationOptions = resolveValidationOptions(options);
      const result = validateTemplate(template, validationOptions);

      printValidationResult(template, result, options.quiet);
      if (result.valid && !options.quiet) {
        console.log(chalk.cyan("  Try it with: ") + chalk.gray(`atomize generate ${templatePath}`));
      }
      outro(result.valid ? "Validation complete ✓" : "Validation failed ✗");
      if (!result.valid) process.exit(ExitCode.Failure);
    } catch (error) {
      handleFatal(error);
      process.exit(ExitCode.Failure);
    }
  });

export function resolveValidationOptions(options: ValidateOptions): ValidationOptions {
  if (options.strict) {
    return { mode: "strict" };
  }
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


function printValidationResult(
  template: TaskTemplate,
  result: ValidationResult,
  quiet?: boolean,
) {
  console.log("");

  if (result.valid) {
    printValidSummary(template, result.warnings, result.mode, quiet);
    return;
  }

  printInvalidSummary(result.errors, result.warnings, result.mode);
}

export function printValidSummary(
  template: TaskTemplate,
  warnings: ValidationWarning[],
  mode: ValidationMode,
  quiet?: boolean,
) {
  const modeLabel =
    mode === "strict" ? chalk.yellow("[Strict]") : chalk.gray("[Lenient]");
  console.log(`${chalk.green("Template is valid!")} ${modeLabel}\n`);

  if (!quiet) {
    const summary = getTemplateSummary(template);
    console.log(chalk.bold("Summary:"));
    console.log(`  Name: ${chalk.cyan(summary.name)}`);
    console.log(`  Tasks: ${chalk.cyan(summary.tasks)}`);
    console.log(`  Total Estimation: ${chalk.cyan(summary.totalEstimation)}`);
    printWarnings(warnings);
  }
}

function printInvalidSummary(
  errors: ValidationError[],
  warnings: ValidationWarning[],
  mode: ValidationMode,
) {
  const modeLabel =
    mode === "strict" ? chalk.yellow("[Strict]") : chalk.gray("[Lenient]");
  console.log(`${chalk.red("Template validation failed")} ${modeLabel}\n`);
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
    boldTitle ? chalk.yellow.bold("Warnings:") : chalk.yellow("Warnings:"),
  );

  warnings.forEach((warn) => {
    console.log(chalk.yellow(`  • ${warn.path}: ${warn.message}`));
  });
}

export function getTemplateSummary(template: TaskTemplate) {
  const totalPercent = template.tasks
    .filter((t: TaskDefinition) => !t.condition)
    .reduce(
      (sum: number, task: TaskDefinition) =>
        sum + (task.estimationPercent ?? 0),
      0,
    );

  return {
    name: template.name,
    tasks: template.tasks.length,
    totalEstimation: `${totalPercent}%`,
  };
}

function handleFatal(error: unknown) {
  cancel("Validation failed");
  logger.error(chalk.red("Validation failed"));

  const message = error instanceof Error ? error.message : String(error);
  console.log(chalk.red(message));
}
